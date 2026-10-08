import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

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
  canonicalIds,
  competitorDisplayName,
  playerAggregateCtes,
  songSelect,
  songStatsCtes,
  voteOpportunityCtes,
  type AnalyticsFilter,
} from "@/lib/analytics";
import { analyticsProgressKey, LEAGUE_CALCULATIONS } from "@/lib/analytics-job-progress";
import { analyticsFailureMessage, budgetedAnalyticsExecutor, configureAnalyticsTransaction, databaseErrorCode, type AnalyticsExecutor } from "@/lib/analytics-job-runtime";
import { ANALYTICS_REVISION } from "@/lib/analytics-revision";
import { ScopeCapacityError, scopeCapacityMessage } from "@/lib/scope-budget";

const ALL_LEAGUES_FILTER: AnalyticsFilter = { leagueIds: [], roundIds: [] };
const MATERIALIZATION_LOCK_KEY = 73_730_001;
const SCOPE_ALL = "all";
type SqlExecutor = AnalyticsExecutor;

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

/**
 * Schedule cache bust after the current request finishes.
 * Combo materialization advances during RSC render (relationships pages),
 * where calling revalidateTag/revalidatePath synchronously is unsupported.
 */
function revalidateAfterMaterialization(): void {
  after(async () => {
    try {
      const { revalidateAnalyticsCache } = await import("@/lib/analytics");
      revalidateAnalyticsCache();
      revalidatePath("/");
      revalidatePath("/songs");
      revalidatePath("/players");
      revalidatePath("/relationships");
      revalidatePath("/relationships/graphs");
      revalidatePath("/facts");
      revalidatePath("/admin");
    } catch (error) {
      console.error("Deferred analytics cache revalidation failed.", error);
    }
  });
}

function progressSummary(
  stepIndex: number,
  leagueIndex?: number,
  leagueCount?: number,
  leagueStepIndex = 0,
  leagueIds?: string[],
): AnalyticsMaterializationProgress {
  const step = MATERIALIZATION_STEPS[stepIndex];
  return {
    kind: "progress", stepId: step.id, stepIndex, stepCount: MATERIALIZATION_STEPS.length,
    stepLabel: step.id === "league-scopes" && leagueCount
      ? `League ${(leagueIndex ?? 0) + 1}/${leagueCount}: ${LEAGUE_CALCULATIONS[leagueStepIndex].label}`
      : step.label,
    leagueIndex, leagueCount, leagueStepIndex, leagueIds,
  };
}

function materializationStatus(job: AnalyticsMaterializationJob): AnalyticsMaterializationStatus {
  return { analyticsRevision: ANALYTICS_REVISION, job, progress: progressFromSummary(job.summary), status: job.status };
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
    await configureAnalyticsTransaction(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
    await tx.update(analyticsMaterializationJobs).set({
      status: "failed", summary: null, errorMessage: reason,
      completedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(analyticsMaterializationJobs.analyticsRevision, ANALYTICS_REVISION), eq(analyticsMaterializationJobs.status, "processing")));
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
    // Multi-league combo rows were just deleted — mark matching scope jobs
    // stale (including completed) so the next visit recomputes instead of
    // trusting an empty cache.
    await tx.execute(sql`
      update analytics_scope_jobs
      set
        status = 'failed',
        error_message = ${reason},
        summary = null,
        completed_at = now(),
        updated_at = now()
      where analytics_revision = ${ANALYTICS_REVISION}
        and position(',' in scope_key) > 0
        and status in ('processing', 'completed', 'failed')
    `);
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
  return database.transaction(async (tx) => {
    await configureAnalyticsTransaction(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
  await tx.execute(sql`
    delete from analytics_relationship_alignment
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await tx.execute(sql`
    delete from analytics_relationship_mutual
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await tx.execute(sql`
    delete from analytics_relationship_pairs
    where scope_key = ${leagueId}
       or scope_key like ${leagueId + ",%"}
       or scope_key like ${"%," + leagueId + ",%"}
       or scope_key like ${"%," + leagueId}
  `);
  await tx.execute(sql`
    delete from analytics_player_stats where scope_key = ${leagueId}
  `);
  await tx.execute(sql`
    delete from analytics_point_distribution where scope_key = ${leagueId}
  `);
  await tx.execute(sql`
    delete from analytics_player_point_distribution where scope_key = ${leagueId}
  `);
  return invalidateAllLeaguesMaterialization(tx as unknown as Database, reason);
  });
}

/** Resume the latest interrupted checkpoint; only a fresh/invalidated cache starts over. */
export async function startMaterializationJob(database: Database = db): Promise<AnalyticsMaterializationStatus> {
  return database.transaction(async (tx) => {
    await configureAnalyticsTransaction(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
    const latest = await getAllLeaguesMaterializationStatus(tx as unknown as Database);
    if (latest.job && latest.progress && (latest.status === "processing" || latest.status === "failed")) {
      let progress = latest.progress;
      if (progress.stepId === "league-scopes" && !progress.leagueIds) {
        const ids = (await tx.select({ id: leagues.id }).from(leagues).orderBy(leagues.id)).map((row) => row.id);
        progress = progressSummary(progress.stepIndex, progress.leagueIndex ?? 0, ids.length, progress.leagueStepIndex ?? 0, ids);
      }
      const [resumed] = await tx.update(analyticsMaterializationJobs).set({
        status: "processing", summary: progress, errorMessage: null, completedAt: null, updatedAt: new Date(),
      }).where(eq(analyticsMaterializationJobs.id, latest.job.id)).returning();
      return materializationStatus(resumed);
    }
    const [created] = await tx.insert(analyticsMaterializationJobs).values({
      analyticsRevision: ANALYTICS_REVISION, startedAt: new Date(), status: "processing", summary: progressSummary(0),
    }).returning();
    return materializationStatus(created);
  });
}

/** Rows and their cursor commit together. Replays never redo a committed checkpoint. */
export async function advanceMaterializationJob(
  jobId: string,
  database: Database = db,
  expectedCursor?: string,
): Promise<AnalyticsMaterializationStatus> {
  let checkpoint: AnalyticsMaterializationProgress | null = null;
  const startedAt = Date.now();
  try {
    const result = await database.transaction(async (tx) => {
      await configureAnalyticsTransaction(tx);
      const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY}) as acquired`);
      const latest = await getAllLeaguesMaterializationStatus(tx as unknown as Database);
      if (!lock?.acquired || !latest.job || latest.job.id !== jobId || latest.status !== "processing") return latest;
      checkpoint = latest.progress;
      if (expectedCursor !== undefined && analyticsProgressKey(checkpoint) !== expectedCursor) return latest;
      const stepIndex = checkpoint?.stepIndex ?? -1;
      if (!checkpoint || stepIndex < 0 || stepIndex >= MATERIALIZATION_STEPS.length || MATERIALIZATION_STEPS[stepIndex].id !== checkpoint.stepId) {
        const failed = await markMaterializationJob(tx as unknown as Database, jobId, {
          status: "failed", errorMessage: "Analytics refresh lost its checkpoint. Start a new refresh.",
        });
        return materializationStatus(failed);
      }
      const executor = budgetedAnalyticsExecutor(tx, startedAt);
      const step = MATERIALIZATION_STEPS[stepIndex];
      const stepStarted = Date.now();
      const stepTimings = () => [...(checkpoint?.steps ?? []), {
        step: step.id === "league-scopes" ? LEAGUE_CALCULATIONS[checkpoint!.leagueStepIndex ?? 0].id : step.id,
        ...(step.id === "league-scopes" ? { leagueId: checkpoint?.leagueIds?.[checkpoint.leagueIndex ?? 0] } : {}),
        elapsedMs: Date.now() - stepStarted,
      }];
      let next = progressSummary(Math.min(stepIndex + 1, MATERIALIZATION_STEPS.length - 1));
      if (step.id === "league-scopes") {
        const leagueIds = checkpoint.leagueIds ?? (await tx.select({ id: leagues.id }).from(leagues).orderBy(leagues.id)).map((row) => row.id);
        const leagueIndex = checkpoint.leagueIndex ?? 0;
        const calculation = checkpoint.leagueStepIndex ?? 0;
        if (leagueIndex < 0 || calculation < 0 || calculation >= LEAGUE_CALCULATIONS.length) throw new Error("Invalid league checkpoint.");
        if (leagueIndex < leagueIds.length) {
          await materializeLeagueCalculation(executor, leagueIds[leagueIndex], calculation);
          const nextCalculation = (calculation + 1) % LEAGUE_CALCULATIONS.length;
          const nextLeague = leagueIndex + (nextCalculation === 0 ? 1 : 0);
          if (nextLeague < leagueIds.length) next = progressSummary(stepIndex, nextLeague, leagueIds.length, nextCalculation, leagueIds);
        }
      } else if (step.id === "finalize") {
        const summary: AnalyticsMaterializationSummary = {
          effectiveVotes: await countRows(executor, "analytics_effective_votes"),
          playerPointDistribution: await countRows(executor, "analytics_player_point_distribution"),
          playerStats: await countRows(executor, "analytics_player_stats"),
          playerTiming: await countRows(executor, "analytics_player_timing"),
          pointDistribution: await countRows(executor, "analytics_point_distribution"),
          relationshipPairs: await countRows(executor, "analytics_relationship_pairs"),
          relationshipMutual: await countRows(executor, "analytics_relationship_mutual"),
          relationshipAlignment: await countRows(executor, "analytics_relationship_alignment"),
          songStats: await countRows(executor, "analytics_song_stats"),
          leagueScopes: await countRows(executor, "leagues"),
        };
        return materializationStatus(await markMaterializationJob(tx as unknown as Database, jobId, {
          status: "completed", summary: { ...summary, kind: "completed", steps: stepTimings() },
        }));
      } else {
        await runMaterializationStep(executor, step.id);
      }
      if (next.stepId === "league-scopes" && !next.leagueIds) {
        const ids = (await tx.select({ id: leagues.id }).from(leagues).orderBy(leagues.id)).map((row) => row.id);
        next = progressSummary(next.stepIndex, 0, ids.length, 0, ids);
      }
      const [updated] = await tx.update(analyticsMaterializationJobs).set({
        summary: { ...next, steps: stepTimings() }, errorMessage: null, updatedAt: new Date(),
      }).where(eq(analyticsMaterializationJobs.id, jobId)).returning();
      return materializationStatus(updated);
    });
    if (result.status === "completed") revalidateAfterMaterialization();
    return result;
  } catch (error) {
    // The computation transaction rolled back. Only fail the same checkpoint;
    // another worker or an invalidation may already have moved it forward.
    const saved = checkpoint as AnalyticsMaterializationProgress | null;
    console.error("Analytics checkpoint failed", { jobId, cursor: analyticsProgressKey(saved), code: databaseErrorCode(error), elapsedMs: Date.now() - startedAt });
    if (saved) {
      await database.transaction(async (tx) => {
        await configureAnalyticsTransaction(tx);
        await tx.update(analyticsMaterializationJobs).set({
          status: "failed", completedAt: new Date(), updatedAt: new Date(),
          errorMessage: analyticsFailureMessage(error, saved.stepLabel),
        }).where(and(
          eq(analyticsMaterializationJobs.id, jobId), eq(analyticsMaterializationJobs.status, "processing"),
          sql`${analyticsMaterializationJobs.summary} = ${JSON.stringify(saved)}::jsonb`,
        ));
      });
      return getAllLeaguesMaterializationStatus(database);
    }
    throw error;
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
        support_index, support_index_eb, support_z, performance_percentile
      )
      with ${songStatsCtes(ALL_LEAGUES_FILTER)}, ranked_songs as (${songSelect()})
      select
        id, title, artist, album, "spotifyUri", "submitterId", "submitterName",
        "leagueId", "leagueName", "leagueSlug", "leagueMusicLeagueId",
        "roundId", "sourceRoundId", "roundName", "roundOrdinal", "submittedAt",
        points, "expectedPoints", "eligibleRows", "positiveRows",
        "pointsPerEligibleVoter", "positiveReach", "roundPointShare",
        "supportIndex", "supportIndexEb", "supportZ", "performancePercentile"
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
      pc.alignment,
      pc.comparable_features,
      pc.shared_rounds,
      (select scope_rounds from scope_thresholds)
    from pair_comparisons pc
    join competitors left_player on left_player.id = pc.left_id
    join competitors right_player on right_player.id = pc.right_id
    where pc.magnitude > 0
  `);
}

async function materializeLeagueCalculation(tx: SqlExecutor, leagueId: string, index: number): Promise<void> {
  const filter: AnalyticsFilter = { leagueIds: [leagueId], roundIds: [] };
  const key = analyticsScopeKey([leagueId]);
  const calculations = [insertPlayerStats, insertPointDistribution, insertPlayerPointDistribution,
    insertRelationshipPairs, insertRelationshipMutual, insertRelationshipAlignment];
  await calculations[index](tx, key, filter);
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
      status: "deferred";
      analyticsRevision: string;
      scopeKey: string;
      job: null;
      progress: null;
      message: string;
    }
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
  const ids = canonicalIds(leagueIds);
  if (ids.length < 2) {
    throw new Error("Scope materialization requires at least two leagues.");
  }
  const scopeKey = analyticsScopeKey(ids);
  const job = await database.transaction(async (tx) => {
    await configureAnalyticsTransaction(tx);
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

    if (latest?.status === "failed" && progressFromSummary(latest.summary)) {
      const [resumed] = await tx.update(analyticsScopeJobs).set({ status: "processing", errorMessage: null, completedAt: null, updatedAt: new Date() })
        .where(eq(analyticsScopeJobs.id, latest.id)).returning();
      return resumed;
    }

    // The advisory lock serializes admission across instances as well as duplicate scopes.
    const [budget] = await tx.execute<{ recent: number; active: number }>(sql`
      select
        count(*) filter (where started_at > now() - interval '1 hour')::int as recent,
        count(*) filter (where status = 'processing' and updated_at > now() - interval '5 minutes')::int as active
      from analytics_scope_jobs where analytics_revision = ${ANALYTICS_REVISION}
    `);
    const capacityMessage = scopeCapacityMessage(budget?.recent ?? 0, budget?.active ?? 0);
    if (capacityMessage) throw new ScopeCapacityError(capacityMessage);

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

/**
 * Ensure a multi-league relationship combo cache exists, advancing one step
 * per call. Intended to run from the relationships page load after a scope
 * filter is applied — not via a dedicated public compute API.
 */
export async function progressScopeMaterialization(
  leagueIds: string[],
  database: Database = db,
): Promise<ScopeMaterializationStatus> {
  const ids = canonicalIds(leagueIds);
  const scopeKey = analyticsScopeKey(ids);
  if (ids.length < 2) {
    return {
      analyticsRevision: ANALYTICS_REVISION,
      job: null,
      progress: null,
      scopeKey,
      status: "missing",
    };
  }
  if (!(await hasFreshAllLeaguesMaterialization(database))) {
    return getScopeMaterializationStatus(scopeKey, database);
  }

  let started: ScopeMaterializationStatus;
  try { started = await startScopeMaterializationJob(ids, database); }
  catch (error) {
    if (!(error instanceof ScopeCapacityError)) throw error;
    return { analyticsRevision: ANALYTICS_REVISION, scopeKey, job: null, progress: null, status: "deferred", message: error.message };
  }
  if (started.status !== "processing" || !started.job) {
    return started;
  }
  return advanceScopeMaterializationJob(started.job.id, database);
}

export async function advanceScopeMaterializationJob(
  jobId: string,
  database: Database = db,
): Promise<ScopeMaterializationStatus> {
  const [job] = await database.select().from(analyticsScopeJobs).where(eq(analyticsScopeJobs.id, jobId)).limit(1);
  if (!job) return { analyticsRevision: ANALYTICS_REVISION, job: null, progress: null, scopeKey: "", status: "missing" };
  const current = progressFromSummary(job.summary);
  const startedAt = Date.now();
  try {
    const result = await database.transaction(async (tx) => {
      await configureAnalyticsTransaction(tx);
      const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY}) as acquired`);
      const latest = await getScopeMaterializationStatus(job.scopeKey, tx as unknown as Database);
      if (!lock?.acquired || latest.job?.id !== jobId || latest.status !== "processing" || analyticsProgressKey(latest.progress) !== analyticsProgressKey(current)) return latest;
      if (!(await hasFreshAllLeaguesMaterialization(tx as unknown as Database))) return latest;
      const step = current && SCOPE_COMBO_STEPS[current.stepIndex];
      if (!step || step.id !== current?.stepId) throw new Error("Invalid scope checkpoint.");
      const executor = budgetedAnalyticsExecutor(tx, startedAt);
      const filter: AnalyticsFilter = { leagueIds: job.scopeKey.split(","), roundIds: [] };
      const stepStarted = Date.now();
      if (step.id === "clear-scope") {
        await executor.execute(sql`delete from analytics_relationship_pairs where scope_key = ${job.scopeKey}`);
        await executor.execute(sql`delete from analytics_relationship_mutual where scope_key = ${job.scopeKey}`);
        await executor.execute(sql`delete from analytics_relationship_alignment where scope_key = ${job.scopeKey}`);
      } else if (step.id === "pairs") {
        await insertRelationshipPairs(executor, job.scopeKey, filter);
      } else if (step.id === "mutual") {
        await insertRelationshipMutual(executor, job.scopeKey, filter);
      } else if (step.id === "alignment") {
        await insertRelationshipAlignment(executor, job.scopeKey, filter);
      }
      const completed = step.id === "finalize";
      const steps = [...(current?.steps ?? []), { step: step.id, elapsedMs: Date.now() - stepStarted }];
      const [updated] = await tx.update(analyticsScopeJobs).set({
        status: completed ? "completed" : "processing", errorMessage: null,
        completedAt: completed ? new Date() : null, updatedAt: new Date(),
        summary: completed ? { kind: "scope-completed", steps } : { ...scopeProgressSummary(current!.stepIndex + 1), steps },
      }).where(eq(analyticsScopeJobs.id, jobId)).returning();
      return { analyticsRevision: ANALYTICS_REVISION, job: updated, progress: progressFromSummary(updated.summary), scopeKey: job.scopeKey, status: updated.status };
    });
    if (result.status === "completed") revalidateAfterMaterialization();
    return result;
  } catch (error) {
    console.error("Scope analytics checkpoint failed", { jobId, cursor: analyticsProgressKey(current), code: databaseErrorCode(error), elapsedMs: Date.now() - startedAt });
    await database.transaction(async (tx) => {
      await configureAnalyticsTransaction(tx);
      await tx.update(analyticsScopeJobs).set({
        status: "failed", completedAt: new Date(), updatedAt: new Date(),
        errorMessage: analyticsFailureMessage(error, current?.stepLabel ?? "Scope refresh"),
      }).where(and(eq(analyticsScopeJobs.id, jobId), eq(analyticsScopeJobs.status, "processing"),
        sql`${analyticsScopeJobs.summary} = ${JSON.stringify(job.summary)}::jsonb`));
    });
    return getScopeMaterializationStatus(job.scopeKey, database);
  }
}
