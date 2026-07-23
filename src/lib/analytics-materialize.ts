import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, type Database } from "@/db";
import {
  analyticsMaterializationJobs,
  analyticsScopeJobs,
  leagues,
  type AnalyticsMaterializationJob,
  type AnalyticsMaterializationJobSummary,
  type AnalyticsMaterializationProgress,
  type AnalyticsMaterializationSummary,
  type AnalyticsScopeJob,
} from "@/db/schema";
import {
  alignmentComparisonCtes,
  analyticsScopeKey,
  competitorDisplayName,
  playerAggregateCtes,
  songSelect,
  songStatsCtes,
  voteOpportunityCtes,
  type AnalyticsFilter,
} from "@/lib/analytics";
import { ANALYTICS_REVISION } from "@/lib/analytics-revision";

const ALL_LEAGUES_FILTER: AnalyticsFilter = { leagueIds: [], roundIds: [] };
const MATERIALIZATION_LOCK_KEY = 73_730_001;
const SCOPE_ALL = "all";
type SqlExecutor = Pick<Database, "execute">;

export const MATERIALIZATION_STEPS = [
  { id: "clear", label: "Clearing cached tables" },
  { id: "facts", label: "Materializing vote opportunities" },
  { id: "songs", label: "Computing song stats" },
  { id: "players", label: "Computing all-leagues player stats" },
  { id: "point-distribution", label: "Computing all-leagues point distribution" },
  {
    id: "player-point-distribution",
    label: "Computing all-leagues per-player point distributions",
  },
  { id: "relationship-pairs", label: "Computing all-leagues directional relationships" },
  { id: "relationship-mutual", label: "Computing all-leagues mutual relationships" },
  { id: "relationship-alignment", label: "Computing all-leagues vote-pattern alignment" },
  { id: "player-timing", label: "Computing ballot timing" },
  { id: "league-scopes", label: "Computing per-league relationship scopes" },
  { id: "finalize", label: "Finalizing and revalidating cache" },
] as const;

export type MaterializationStepId = (typeof MATERIALIZATION_STEPS)[number]["id"];

export type AnalyticsMaterializationStatus =
  | {
      status: "missing";
      analyticsRevision: string;
      job: null;
      progress: null;
    }
  | {
      status: AnalyticsMaterializationJob["status"];
      analyticsRevision: string;
      job: AnalyticsMaterializationJob;
      progress: AnalyticsMaterializationProgress | null;
    };

function progressFromSummary(
  summary: AnalyticsMaterializationJobSummary | null | undefined,
): AnalyticsMaterializationProgress | null {
  if (summary && "kind" in summary && summary.kind === "progress") {
    return summary;
  }
  return null;
}

export async function getAllLeaguesMaterializationStatus(
  database: Database = db,
): Promise<AnalyticsMaterializationStatus> {
  const [job] = await database
    .select()
    .from(analyticsMaterializationJobs)
    .where(eq(analyticsMaterializationJobs.analyticsRevision, ANALYTICS_REVISION))
    .orderBy(desc(analyticsMaterializationJobs.createdAt))
    .limit(1);

  return job
    ? {
        analyticsRevision: ANALYTICS_REVISION,
        job,
        progress: progressFromSummary(job.summary),
        status: job.status,
      }
    : {
        analyticsRevision: ANALYTICS_REVISION,
        job: null,
        progress: null,
        status: "missing",
      };
}

export async function hasFreshAllLeaguesMaterialization(
  database: Database = db,
): Promise<boolean> {
  const status = await getAllLeaguesMaterializationStatus(database);
  return status.status === "completed";
}

async function countRows(database: SqlExecutor, tableName: string): Promise<number> {
  const [row] = await database.execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${tableName}`),
  );
  return row?.count ?? 0;
}

async function revalidateAfterMaterialization(): Promise<void> {
  const { revalidateAnalyticsCache } = await import("@/lib/analytics");
  revalidateAnalyticsCache();
  revalidatePath("/");
  revalidatePath("/songs");
  revalidatePath("/players");
  revalidatePath("/relationships");
  revalidatePath("/facts");
  revalidatePath("/admin");
}

function progressSummary(
  stepIndex: number,
  leagueIndex?: number,
  leagueCount?: number,
): AnalyticsMaterializationProgress {
  const step = MATERIALIZATION_STEPS[stepIndex];
  return {
    kind: "progress",
    stepId: step.id,
    stepIndex,
    stepCount: MATERIALIZATION_STEPS.length,
    stepLabel:
      step.id === "league-scopes" && leagueCount
        ? `${step.label} (${(leagueIndex ?? 0) + 1}/${leagueCount})`
        : step.label,
    leagueIndex,
    leagueCount,
  };
}

/**
 * Advance the step cursor only if the job is still on `fromStepIndex`.
 * Prevents a late/stale advance from rewinding progress after another worker
 * (or a retried request) already moved forward.
 */
async function casAdvanceJobProgress(
  database: Database,
  jobId: string,
  fromStepIndex: number,
): Promise<AnalyticsMaterializationJob | null> {
  const [job] = await database
    .update(analyticsMaterializationJobs)
    .set({
      summary: progressSummary(fromStepIndex + 1),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(analyticsMaterializationJobs.id, jobId),
        eq(analyticsMaterializationJobs.status, "processing"),
        sql`${analyticsMaterializationJobs.summary}->>'stepIndex' = ${String(fromStepIndex)}`,
      ),
    )
    .returning();
  return job ?? null;
}

async function markMaterializationJob(
  database: Database,
  jobId: string,
  update: {
    status: "completed" | "failed";
    errorMessage?: string | null;
    summary?: AnalyticsMaterializationJobSummary | null;
  },
): Promise<AnalyticsMaterializationJob> {
  const [job] = await database
    .update(analyticsMaterializationJobs)
    .set({
      completedAt: new Date(),
      errorMessage: update.errorMessage ?? null,
      status: update.status,
      summary: update.summary ?? null,
      updatedAt: new Date(),
    })
    .where(eq(analyticsMaterializationJobs.id, jobId))
    .returning();
  return job;
}

/**
 * Mark all-leagues mats stale so reads fall back to live SQL until refresh
 * completes. Does not delete mat rows.
 */
export async function invalidateAllLeaguesMaterialization(
  database: Database = db,
  reason = "Invalidated pending analytics refresh.",
): Promise<AnalyticsMaterializationJob> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
    // Drop multi-league combo relationship caches; eager rows clear on next rebuild.
    await tx.execute(sql`
      delete from analytics_relationship_alignment where position(',' in scope_key) > 0
    `);
    await tx.execute(sql`
      delete from analytics_relationship_mutual where position(',' in scope_key) > 0
    `);
    await tx.execute(sql`
      delete from analytics_relationship_pairs where position(',' in scope_key) > 0
    `);
    await tx
      .update(analyticsScopeJobs)
      .set({
        completedAt: new Date(),
        errorMessage: reason,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(analyticsScopeJobs.analyticsRevision, ANALYTICS_REVISION),
          eq(analyticsScopeJobs.status, "processing"),
        ),
      );
    const [job] = await tx
      .insert(analyticsMaterializationJobs)
      .values({
        analyticsRevision: ANALYTICS_REVISION,
        errorMessage: reason,
        startedAt: new Date(),
        status: "pending",
      })
      .returning();
    return job;
  });
}

/** Invalidate base mats and any combo scopes that include this league. */
export async function invalidateScopesContainingLeague(
  leagueId: string,
  database: Database = db,
  reason = "Invalidated after league data change.",
): Promise<AnalyticsMaterializationJob> {
  await database.execute(sql`
    delete from analytics_relationship_alignment
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await database.execute(sql`
    delete from analytics_relationship_mutual
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await database.execute(sql`
    delete from analytics_relationship_pairs
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await database.execute(sql`
    delete from analytics_player_stats where scope_key = ${leagueId}
  `);
  await database.execute(sql`
    delete from analytics_point_distribution where scope_key = ${leagueId}
  `);
  await database.execute(sql`
    delete from analytics_player_point_distribution where scope_key = ${leagueId}
  `);
  return invalidateAllLeaguesMaterialization(database, reason);
}

/**
 * Start a stepped refresh job. Marks any older in-flight jobs for this revision
 * as failed, then creates a processing job at step 0 (not yet executed).
 * Call advanceMaterializationJob repeatedly until status is completed/failed.
 */
export async function startMaterializationJob(
  database: Database = db,
): Promise<AnalyticsMaterializationStatus> {
  const job = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);

    await tx
      .update(analyticsMaterializationJobs)
      .set({
        completedAt: new Date(),
        errorMessage: "Superseded by a newer analytics refresh.",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(analyticsMaterializationJobs.analyticsRevision, ANALYTICS_REVISION),
          eq(analyticsMaterializationJobs.status, "processing"),
        ),
      );

    const [created] = await tx
      .insert(analyticsMaterializationJobs)
      .values({
        analyticsRevision: ANALYTICS_REVISION,
        startedAt: new Date(),
        status: "processing",
        summary: progressSummary(0),
      })
      .returning();
    return created;
  });

  return {
    analyticsRevision: ANALYTICS_REVISION,
    job,
    progress: progressFromSummary(job.summary),
    status: job.status,
  };
}

/**
 * Execute the next materialization step for a processing job.
 * Each step commits independently. Start always clears tables first, so a
 * restarted job never inserts duplicates on top of a partial run.
 */
export async function advanceMaterializationJob(
  jobId: string,
  database: Database = db,
): Promise<AnalyticsMaterializationStatus> {
  const [job] = await database
    .select()
    .from(analyticsMaterializationJobs)
    .where(eq(analyticsMaterializationJobs.id, jobId))
    .limit(1);

  if (!job) {
    return getAllLeaguesMaterializationStatus(database);
  }
  if (job.status !== "processing") {
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job,
      progress: progressFromSummary(job.summary),
      status: job.status,
    };
  }

  const current = progressFromSummary(job.summary);
  const stepIndex = current?.stepIndex ?? 0;
  if (stepIndex < 0 || stepIndex >= MATERIALIZATION_STEPS.length) {
    const failed = await markMaterializationJob(database, job.id, {
      errorMessage: "Analytics refresh lost its step cursor.",
      status: "failed",
    });
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: failed,
      progress: null,
      status: failed.status,
    };
  }

  const step = MATERIALIZATION_STEPS[stepIndex];

  try {
    if (step.id === "league-scopes") {
      const leagueRows = await database
        .select({ id: leagues.id })
        .from(leagues)
        .orderBy(leagues.id);
      const leagueCount = leagueRows.length;
      const leagueIndex = current?.leagueIndex ?? 0;

      if (leagueIndex < leagueCount) {
        await database.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`,
          );
          const [locked] = await tx
            .select()
            .from(analyticsMaterializationJobs)
            .where(eq(analyticsMaterializationJobs.id, jobId))
            .limit(1);
          const lockedProgress = progressFromSummary(locked?.summary);
          if (
            !locked ||
            locked.status !== "processing" ||
            lockedProgress?.stepIndex !== stepIndex ||
            (lockedProgress.leagueIndex ?? 0) !== leagueIndex
          ) {
            return;
          }
          await materializeEagerLeagueScope(tx, leagueRows[leagueIndex].id);
        });

        const nextLeague = leagueIndex + 1;
        if (nextLeague < leagueCount) {
          const [updated] = await database
            .update(analyticsMaterializationJobs)
            .set({
              summary: progressSummary(stepIndex, nextLeague, leagueCount),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(analyticsMaterializationJobs.id, job.id),
                eq(analyticsMaterializationJobs.status, "processing"),
              ),
            )
            .returning();
          return {
            analyticsRevision: ANALYTICS_REVISION,
            job: updated ?? job,
            progress: progressFromSummary(updated?.summary ?? job.summary),
            status: "processing",
          };
        }
        // Finished all leagues — fall through to CAS advance to next step.
      }
    } else {
      await database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`,
        );
        const [locked] = await tx
          .select()
          .from(analyticsMaterializationJobs)
          .where(eq(analyticsMaterializationJobs.id, jobId))
          .limit(1);
        const lockedProgress = progressFromSummary(locked?.summary);
        if (
          !locked ||
          locked.status !== "processing" ||
          lockedProgress?.stepIndex !== stepIndex
        ) {
          return;
        }
        await runMaterializationStep(tx, step.id);
      });
    }

    const latest = await getAllLeaguesMaterializationStatus(database);
    if (
      latest.status !== "processing" ||
      latest.job?.id !== job.id ||
      progressFromSummary(latest.job.summary)?.stepIndex !== stepIndex
    ) {
      return latest;
    }

    if (step.id === "finalize") {
      const summary: AnalyticsMaterializationSummary = {
        effectiveVotes: await countRows(database, "analytics_effective_votes"),
        playerPointDistribution: await countRows(
          database,
          "analytics_player_point_distribution",
        ),
        playerStats: await countRows(database, "analytics_player_stats"),
        playerTiming: await countRows(database, "analytics_player_timing"),
        pointDistribution: await countRows(database, "analytics_point_distribution"),
        relationshipAlignment: await countRows(
          database,
          "analytics_relationship_alignment",
        ),
        relationshipMutual: await countRows(
          database,
          "analytics_relationship_mutual",
        ),
        relationshipPairs: await countRows(
          database,
          "analytics_relationship_pairs",
        ),
        songStats: await countRows(database, "analytics_song_stats"),
        leagueScopes: (
          await database.select({ id: leagues.id }).from(leagues)
        ).length,
      };
      const completed = await markMaterializationJob(database, job.id, {
        errorMessage: null,
        status: "completed",
        summary: { ...summary, kind: "completed" },
      });
      try {
        await revalidateAfterMaterialization();
      } catch (error) {
        console.error(
          "Analytics materialization completed but cache revalidation failed.",
          error,
        );
      }
      return {
        analyticsRevision: ANALYTICS_REVISION,
        job: completed,
        progress: null,
        status: completed.status,
      };
    }

    const updated = await casAdvanceJobProgress(database, job.id, stepIndex);
    if (!updated) {
      return getAllLeaguesMaterializationStatus(database);
    }
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: updated,
      progress: progressFromSummary(updated.summary),
      status: updated.status,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Analytics materialization failed.";
    const failed = await markMaterializationJob(database, job.id, {
      errorMessage: message,
      status: "failed",
    });
    try {
      await revalidateAfterMaterialization();
    } catch (revalidateError) {
      console.error(
        "Failed analytics materialization cache revalidation also failed.",
        revalidateError,
      );
    }
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: failed,
      progress: null,
      status: failed.status,
    };
  }
}

/** @deprecated Prefer startMaterializationJob + advanceMaterializationJob. */
export async function refreshAllLeaguesMaterialization(
  database: Database = db,
  { force = false }: { force?: boolean } = {},
): Promise<AnalyticsMaterializationJob> {
  if (!force) {
    const existing = await getAllLeaguesMaterializationStatus(database);
    if (existing.status === "completed" && existing.job) return existing.job;
  }

  let status = await startMaterializationJob(database);
  while (status.status === "processing" && status.job) {
    status = await advanceMaterializationJob(status.job.id, database);
  }
  if (!status.job) {
    throw new Error("Analytics materialization job disappeared.");
  }
  return status.job;
}

async function runMaterializationStep(
  tx: SqlExecutor,
  stepId: MaterializationStepId,
): Promise<void> {
  if (stepId === "clear") {
    await tx.execute(sql`delete from analytics_player_timing`);
    await tx.execute(sql`delete from analytics_relationship_alignment`);
    await tx.execute(sql`delete from analytics_relationship_mutual`);
    await tx.execute(sql`delete from analytics_relationship_pairs`);
    await tx.execute(sql`delete from analytics_player_point_distribution`);
    await tx.execute(sql`delete from analytics_point_distribution`);
    await tx.execute(sql`delete from analytics_player_stats`);
    await tx.execute(sql`delete from analytics_song_stats`);
    await tx.execute(sql`delete from analytics_effective_votes`);
    await tx.execute(sql`delete from analytics_scope_jobs`);
    return;
  }

  if (stepId === "facts") {
    await tx.execute(sql`delete from analytics_effective_votes`);
    await tx.execute(sql`
      insert into analytics_effective_votes (
        submission_id, league_id, round_id, submitter_id, voter_id, points, explicit
      )
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)}
      select
        ev.submission_id,
        ev.league_id,
        ev.round_id,
        ev.submitter_id,
        ev.voter_id,
        ev.points,
        ev.explicit
      from effective_votes ev
    `);
    return;
  }

  if (stepId === "songs") {
    await tx.execute(sql`delete from analytics_song_stats`);
    await tx.execute(sql`
      insert into analytics_song_stats (
        id, title, artist, album, spotify_uri, submitter_id, submitter_name,
        league_id, league_name, league_slug, league_music_league_id,
        round_id, source_round_id, round_name, round_ordinal, submitted_at,
        points, expected_points, eligible_rows, positive_rows,
        points_per_eligible_voter, positive_reach, round_point_share,
        support_index, performance_percentile
      )
      with ${songStatsCtes(ALL_LEAGUES_FILTER)}, ranked_songs as (${songSelect()})
      select
        id, title, artist, album, "spotifyUri", "submitterId", "submitterName",
        "leagueId", "leagueName", "leagueSlug", "leagueMusicLeagueId",
        "roundId", "sourceRoundId", "roundName", "roundOrdinal", "submittedAt",
        points, "expectedPoints", "eligibleRows", "positiveRows",
        "pointsPerEligibleVoter", "positiveReach", "roundPointShare",
        "supportIndex", "performancePercentile"
      from ranked_songs
    `);
    return;
  }

  if (stepId === "players") {
    await insertPlayerStats(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "point-distribution") {
    await insertPointDistribution(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "player-point-distribution") {
    await insertPlayerPointDistribution(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "relationship-pairs") {
    await insertRelationshipPairs(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "relationship-mutual") {
    await insertRelationshipMutual(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "relationship-alignment") {
    await insertRelationshipAlignment(tx, SCOPE_ALL, ALL_LEAGUES_FILTER);
    return;
  }

  if (stepId === "player-timing") {
    await tx.execute(sql`delete from analytics_player_timing`);
    await tx.execute(sql`
      insert into analytics_player_timing (
        player_id, player_name, round_id, round_name, league_id, league_name, league_slug,
        league_music_league_id, source_round_id, ordinal, cast_at,
        relative_order, ballot_rank, tie_count, observed_voters, participation
      )
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)},
      round_ballot_counts as (
        select round_id, count(*)::int as observed_voters
        from active_ballots
        group by round_id
      ),
      ballot_positions as (
        select
          active_ballots.*,
          rbc.observed_voters,
          rank() over (
            partition by active_ballots.round_id
            order by active_ballots.cast_at
          )::int as ballot_rank,
          count(*) over (
            partition by active_ballots.round_id, active_ballots.cast_at
          )::int as tie_count
        from active_ballots
        join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
      ),
      ranked_ballots as (
        select
          ballot_positions.*,
          case
            when observed_voters = 1 then 0.5::double precision
            else (
              ballot_rank::double precision - 1 + tie_count::double precision / 2
            ) / observed_voters
          end as relative_order
        from ballot_positions
      ),
      player_scope_rounds as (
        select distinct s.submitter_id as player_id, s.round_id
        from submissions s
        join selected_rounds sr on sr.id = s.round_id
        union
        select distinct ab.voter_id as player_id, ab.round_id
        from active_ballots ab
      )
      select
        psr.player_id,
        ${competitorDisplayName("c")},
        sr.id,
        sr.name,
        l.id,
        l.name,
        l.slug,
        l.music_league_id,
        sr.source_round_id,
        sr.ordinal,
        rb.cast_at,
        rb.relative_order,
        rb.ballot_rank,
        rb.tie_count,
        coalesce(rb.observed_voters, rbc.observed_voters, 0)::int,
        case when rb.voter_id is null then 'did_not_vote' else 'voted' end
      from player_scope_rounds psr
      join selected_rounds sr on sr.id = psr.round_id
      join leagues l on l.id = sr.league_id
      join competitors c on c.id = psr.player_id
      left join ranked_ballots rb
        on rb.round_id = psr.round_id
       and rb.voter_id = psr.player_id
      left join round_ballot_counts rbc on rbc.round_id = psr.round_id
    `);
    return;
  }

  if (stepId === "league-scopes" || stepId === "finalize") {
    return;
  }
}

async function insertPlayerStats(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(sql`delete from analytics_player_stats where scope_key = ${scopeKey}`);
  await tx.execute(sql`
    insert into analytics_player_stats (
      scope_key, id, name, total_points, submissions, entered_rounds,
      points_per_submission, points_per_eligible_voter,
      average_round_index, average_round_percentile,
      round_wins, top_quartile_rate, performance_rank
    )
    with ${songStatsCtes(filter)}, ${playerAggregateCtes()}
    select
      ${scopeKey},
      c.id,
      ${competitorDisplayName("c")} as name,
      pa.total_points,
      pa.submissions,
      pa.entered_rounds,
      case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end,
      case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end,
      pa.average_round_index,
      pa.average_round_percentile,
      pa.round_wins,
      case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end,
      case
        when pa.entered_rounds >= 3
          then rank() over (
            order by
              case when pa.entered_rounds >= 3 then 0 else 1 end,
              pa.average_round_index desc nulls last,
              pa.entered_rounds desc,
              pa.total_points desc,
              c.id
          )::int
        else null
      end
    from player_aggregates pa
    join competitors c on c.id = pa.submitter_id
  `);
}

async function insertPointDistribution(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(
    sql`delete from analytics_point_distribution where scope_key = ${scopeKey}`,
  );
  await tx.execute(sql`
    insert into analytics_point_distribution (scope_key, points, count)
    with ${voteOpportunityCtes(filter)}
    select ${scopeKey}, ev.points, count(*)::int
    from effective_votes ev
    group by ev.points
  `);
}

async function insertPlayerPointDistribution(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(sql`
    delete from analytics_player_point_distribution where scope_key = ${scopeKey}
  `);
  await tx.execute(sql`
    insert into analytics_player_point_distribution (scope_key, player_id, direction, points, count)
    with ${voteOpportunityCtes(filter)}
    select ${scopeKey}, ev.submitter_id, 'received', ev.points, count(*)::int
    from effective_votes ev
    group by ev.submitter_id, ev.points
    union all
    select ${scopeKey}, ev.voter_id, 'given', ev.points, count(*)::int
    from effective_votes ev
    group by ev.voter_id, ev.points
  `);
}

async function insertRelationshipPairs(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(
    sql`delete from analytics_relationship_pairs where scope_key = ${scopeKey}`,
  );
  await tx.execute(sql`
    insert into analytics_relationship_pairs (
      scope_key, direction, left_id, left_name, right_id, right_name, points,
      opportunities, shared_rounds, scope_rounds,
      points_per_opportunity, positive_rate
    )
    with ${voteOpportunityCtes(filter)},
    relationship_rows as (
      select
        'received'::text as direction,
        ev.submitter_id as left_id,
        ev.voter_id as right_id,
        sum(ev.points)::int as points,
        count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      group by left_id, right_id
      union all
      select
        'given'::text as direction,
        ev.voter_id as left_id,
        ev.submitter_id as right_id,
        sum(ev.points)::int as points,
        count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      group by left_id, right_id
    )
    select
      ${scopeKey},
      rr.direction,
      rr.left_id,
      ${competitorDisplayName("left_player")},
      rr.right_id,
      ${competitorDisplayName("right_player")},
      rr.points,
      rr.opportunities,
      rr.shared_rounds,
      (select scope_rounds from scope_thresholds),
      rr.points::double precision / nullif(rr.opportunities, 0),
      rr.positives::double precision / nullif(rr.opportunities, 0)
    from relationship_rows rr
    join competitors left_player on left_player.id = rr.left_id
    join competitors right_player on right_player.id = rr.right_id
    where rr.shared_rounds >= (select minimum_shared_rounds from scope_thresholds)
  `);
}

async function insertRelationshipMutual(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(
    sql`delete from analytics_relationship_mutual where scope_key = ${scopeKey}`,
  );
  await tx.execute(sql`
    insert into analytics_relationship_mutual (
      scope_key, left_id, left_name, right_id, right_name, points, opportunities,
      shared_rounds, scope_rounds, points_per_opportunity,
      positive_rate, ballot_point_share
    )
    with ${voteOpportunityCtes(filter)},
    mutual_rows as (
      select
        case when ev.voter_id < ev.submitter_id then ev.voter_id else ev.submitter_id end as left_id,
        case when ev.voter_id < ev.submitter_id then ev.submitter_id else ev.voter_id end as right_id,
        sum(ev.points)::int as points,
        count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      group by left_id, right_id
    ),
    mutual_budget_rows as (
      select distinct
        case when ev.voter_id < ev.submitter_id then ev.voter_id else ev.submitter_id end as left_id,
        case when ev.voter_id < ev.submitter_id then ev.submitter_id else ev.voter_id end as right_id,
        ev.round_id,
        ev.voter_id,
        bt.ballot_points
      from effective_votes ev
      join ballot_totals bt
        on bt.round_id = ev.round_id
       and bt.voter_id = ev.voter_id
    ),
    mutual_budgets as (
      select left_id, right_id, sum(ballot_points)::double precision as eligible_ballot_points
      from mutual_budget_rows
      group by left_id, right_id
    )
    select
      ${scopeKey},
      mr.left_id,
      ${competitorDisplayName("left_player")},
      mr.right_id,
      ${competitorDisplayName("right_player")},
      mr.points,
      mr.opportunities,
      mr.shared_rounds,
      (select scope_rounds from scope_thresholds),
      mr.points::double precision / nullif(mr.opportunities, 0),
      mr.positives::double precision / nullif(mr.opportunities, 0),
      mr.points::double precision / nullif(mb.eligible_ballot_points, 0)
    from mutual_rows mr
    join mutual_budgets mb on mb.left_id = mr.left_id and mb.right_id = mr.right_id
    join competitors left_player on left_player.id = mr.left_id
    join competitors right_player on right_player.id = mr.right_id
    where mr.opportunities > 0
      and mb.eligible_ballot_points > 0
      and mr.shared_rounds >= (select minimum_shared_rounds from scope_thresholds)
  `);
}

async function insertRelationshipAlignment(
  tx: SqlExecutor,
  scopeKey: string,
  filter: AnalyticsFilter,
): Promise<void> {
  await tx.execute(sql`
    delete from analytics_relationship_alignment where scope_key = ${scopeKey}
  `);
  await tx.execute(sql`
    insert into analytics_relationship_alignment (
      scope_key, left_id, left_name, right_id, right_name, alignment,
      comparable_features, shared_rounds, scope_rounds
    )
    with ${alignmentComparisonCtes(filter)}
    select
      ${scopeKey},
      pc.left_id,
      ${competitorDisplayName("left_player")},
      pc.right_id,
      ${competitorDisplayName("right_player")},
      pc.dot / nullif(pc.magnitude, 0),
      pc.comparable_features,
      pc.shared_rounds,
      (select scope_rounds from scope_thresholds)
    from pair_comparisons pc
    join competitors left_player on left_player.id = pc.left_id
    join competitors right_player on right_player.id = pc.right_id
    where pc.magnitude > 0
  `);
}

async function materializeEagerLeagueScope(
  tx: SqlExecutor,
  leagueId: string,
): Promise<void> {
  const filter: AnalyticsFilter = { leagueIds: [leagueId], roundIds: [] };
  const scopeKey = analyticsScopeKey([leagueId]);
  await insertPlayerStats(tx, scopeKey, filter);
  await insertPointDistribution(tx, scopeKey, filter);
  await insertPlayerPointDistribution(tx, scopeKey, filter);
  await insertRelationshipPairs(tx, scopeKey, filter);
  await insertRelationshipMutual(tx, scopeKey, filter);
  await insertRelationshipAlignment(tx, scopeKey, filter);
}

const SCOPE_COMBO_STEPS = [
  { id: "clear-scope", label: "Clearing scope relationship cache" },
  { id: "pairs", label: "Computing directional relationships" },
  { id: "mutual", label: "Computing mutual relationships" },
  { id: "alignment", label: "Computing vote-pattern alignment" },
  { id: "finalize", label: "Finalizing scope cache" },
] as const;

export type ScopeMaterializationStatus =
  | {
      status: "missing";
      analyticsRevision: string;
      scopeKey: string;
      job: null;
      progress: null;
    }
  | {
      status: AnalyticsScopeJob["status"];
      analyticsRevision: string;
      scopeKey: string;
      job: AnalyticsScopeJob;
      progress: AnalyticsMaterializationProgress | null;
    };

function scopeProgressSummary(
  stepIndex: number,
): AnalyticsMaterializationProgress {
  const step = SCOPE_COMBO_STEPS[stepIndex];
  return {
    kind: "progress",
    stepId: step.id,
    stepIndex,
    stepCount: SCOPE_COMBO_STEPS.length,
    stepLabel: step.label,
  };
}

export async function getScopeMaterializationStatus(
  scopeKey: string,
  database: Database = db,
): Promise<ScopeMaterializationStatus> {
  const [job] = await database
    .select()
    .from(analyticsScopeJobs)
    .where(
      and(
        eq(analyticsScopeJobs.analyticsRevision, ANALYTICS_REVISION),
        eq(analyticsScopeJobs.scopeKey, scopeKey),
      ),
    )
    .orderBy(desc(analyticsScopeJobs.createdAt))
    .limit(1);

  return job
    ? {
        analyticsRevision: ANALYTICS_REVISION,
        job,
        progress: progressFromSummary(job.summary),
        scopeKey,
        status: job.status,
      }
    : {
        analyticsRevision: ANALYTICS_REVISION,
        job: null,
        progress: null,
        scopeKey,
        status: "missing",
      };
}

export async function hasFreshScopeMaterialization(
  scopeKey: string,
  database: Database = db,
): Promise<boolean> {
  if (scopeKey === SCOPE_ALL || !scopeKey.includes(",")) {
    return hasFreshAllLeaguesMaterialization(database);
  }
  const status = await getScopeMaterializationStatus(scopeKey, database);
  return status.status === "completed";
}

export async function startScopeMaterializationJob(
  leagueIds: string[],
  database: Database = db,
): Promise<ScopeMaterializationStatus> {
  const ids = [...new Set(leagueIds)].filter(Boolean).sort();
  if (ids.length < 2) {
    throw new Error("Scope materialization requires at least two leagues.");
  }
  const scopeKey = analyticsScopeKey(ids);
  const job = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);

    const [latest] = await tx
      .select()
      .from(analyticsScopeJobs)
      .where(
        and(
          eq(analyticsScopeJobs.analyticsRevision, ANALYTICS_REVISION),
          eq(analyticsScopeJobs.scopeKey, scopeKey),
        ),
      )
      .orderBy(desc(analyticsScopeJobs.createdAt))
      .limit(1);

    // Resume in-flight work or reuse a completed cache instead of superseding.
    if (latest && (latest.status === "processing" || latest.status === "completed")) {
      return latest;
    }

    const [created] = await tx
      .insert(analyticsScopeJobs)
      .values({
        analyticsRevision: ANALYTICS_REVISION,
        scopeKey,
        startedAt: new Date(),
        status: "processing",
        summary: scopeProgressSummary(0),
      })
      .returning();
    return created;
  });
  return {
    analyticsRevision: ANALYTICS_REVISION,
    job,
    progress: progressFromSummary(job.summary),
    scopeKey,
    status: job.status,
  };
}

export async function advanceScopeMaterializationJob(
  jobId: string,
  database: Database = db,
): Promise<ScopeMaterializationStatus> {
  const [job] = await database
    .select()
    .from(analyticsScopeJobs)
    .where(eq(analyticsScopeJobs.id, jobId))
    .limit(1);
  if (!job) {
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: null,
      progress: null,
      scopeKey: "",
      status: "missing",
    };
  }
  if (job.status !== "processing") {
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job,
      progress: progressFromSummary(job.summary),
      scopeKey: job.scopeKey,
      status: job.status,
    };
  }

  const current = progressFromSummary(job.summary);
  const stepIndex = current?.stepIndex ?? 0;
  if (stepIndex < 0 || stepIndex >= SCOPE_COMBO_STEPS.length) {
    const [failed] = await database
      .update(analyticsScopeJobs)
      .set({
        completedAt: new Date(),
        errorMessage: "Scope refresh lost its step cursor.",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(analyticsScopeJobs.id, job.id))
      .returning();
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: failed,
      progress: null,
      scopeKey: job.scopeKey,
      status: failed.status,
    };
  }

  const step = SCOPE_COMBO_STEPS[stepIndex];
  const filter: AnalyticsFilter = {
    leagueIds: job.scopeKey.split(","),
    roundIds: [],
  };

  try {
    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
      if (step.id === "clear-scope") {
        await tx.execute(
          sql`delete from analytics_relationship_pairs where scope_key = ${job.scopeKey}`,
        );
        await tx.execute(
          sql`delete from analytics_relationship_mutual where scope_key = ${job.scopeKey}`,
        );
        await tx.execute(
          sql`delete from analytics_relationship_alignment where scope_key = ${job.scopeKey}`,
        );
        return;
      }
      if (step.id === "pairs") {
        await insertRelationshipPairs(tx, job.scopeKey, filter);
        return;
      }
      if (step.id === "mutual") {
        await insertRelationshipMutual(tx, job.scopeKey, filter);
        return;
      }
      if (step.id === "alignment") {
        await insertRelationshipAlignment(tx, job.scopeKey, filter);
      }
    });

    if (step.id === "finalize") {
      const [completed] = await database
        .update(analyticsScopeJobs)
        .set({
          completedAt: new Date(),
          errorMessage: null,
          status: "completed",
          summary: {
            kind: "completed",
            songStats: 0,
            playerStats: 0,
            pointDistribution: 0,
            playerPointDistribution: 0,
            relationshipPairs: 0,
            relationshipMutual: 0,
            relationshipAlignment: 0,
            playerTiming: 0,
          },
          updatedAt: new Date(),
        })
        .where(eq(analyticsScopeJobs.id, job.id))
        .returning();
      try {
        await revalidateAfterMaterialization();
      } catch (error) {
        console.error("Scope materialization revalidation failed.", error);
      }
      return {
        analyticsRevision: ANALYTICS_REVISION,
        job: completed,
        progress: null,
        scopeKey: job.scopeKey,
        status: completed.status,
      };
    }

    const [updated] = await database
      .update(analyticsScopeJobs)
      .set({
        summary: scopeProgressSummary(stepIndex + 1),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(analyticsScopeJobs.id, job.id),
          eq(analyticsScopeJobs.status, "processing"),
        ),
      )
      .returning();
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: updated ?? job,
      progress: progressFromSummary(updated?.summary),
      scopeKey: job.scopeKey,
      status: "processing",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scope materialization failed.";
    const [failed] = await database
      .update(analyticsScopeJobs)
      .set({
        completedAt: new Date(),
        errorMessage: message,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(analyticsScopeJobs.id, job.id))
      .returning();
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: failed,
      progress: null,
      scopeKey: job.scopeKey,
      status: failed.status,
    };
  }
}
