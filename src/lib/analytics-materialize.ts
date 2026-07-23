import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, type Database } from "@/db";
import {
  analyticsMaterializationJobs,
  type AnalyticsMaterializationJob,
  type AnalyticsMaterializationJobSummary,
  type AnalyticsMaterializationProgress,
  type AnalyticsMaterializationSummary,
} from "@/db/schema";
import {
  alignmentComparisonCtes,
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
type SqlExecutor = Pick<Database, "execute">;

export const MATERIALIZATION_STEPS = [
  { id: "clear", label: "Clearing cached tables" },
  { id: "songs", label: "Computing song stats" },
  { id: "players", label: "Computing player stats" },
  { id: "point-distribution", label: "Computing point distribution" },
  {
    id: "player-point-distribution",
    label: "Computing per-player point distributions",
  },
  { id: "relationship-pairs", label: "Computing directional relationships" },
  { id: "relationship-mutual", label: "Computing mutual relationships" },
  { id: "relationship-alignment", label: "Computing vote-pattern alignment" },
  { id: "player-timing", label: "Computing ballot timing" },
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

function progressSummary(stepIndex: number): AnalyticsMaterializationProgress {
  const step = MATERIALIZATION_STEPS[stepIndex];
  return {
    kind: "progress",
    stepId: step.id,
    stepIndex,
    stepCount: MATERIALIZATION_STEPS.length,
    stepLabel: step.label,
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
    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${MATERIALIZATION_LOCK_KEY})`);
      // Re-read under the lock so a concurrent advance cannot double-run a step.
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
    return;
  }

  if (stepId === "songs") {
    // Delete-then-insert so a retried step after a kill mid-flight cannot
    // leave duplicate primary keys for the next refresh.
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
    await tx.execute(sql`delete from analytics_player_stats`);
    await tx.execute(sql`
      insert into analytics_player_stats (
        id, name, total_points, submissions, entered_rounds,
        points_per_submission, points_per_eligible_voter,
        average_round_index, average_round_percentile,
        round_wins, top_quartile_rate, performance_rank
      )
      with ${songStatsCtes(ALL_LEAGUES_FILTER)}, ${playerAggregateCtes()}
      select
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
    return;
  }

  if (stepId === "point-distribution") {
    await tx.execute(sql`delete from analytics_point_distribution`);
    await tx.execute(sql`
      insert into analytics_point_distribution (points, count)
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)}
      select ev.points, count(*)::int
      from effective_votes ev
      group by ev.points
    `);
    return;
  }

  if (stepId === "player-point-distribution") {
    await tx.execute(sql`delete from analytics_player_point_distribution`);
    await tx.execute(sql`
      insert into analytics_player_point_distribution (player_id, direction, points, count)
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)}
      select ev.submitter_id, 'received', ev.points, count(*)::int
      from effective_votes ev
      group by ev.submitter_id, ev.points
      union all
      select ev.voter_id, 'given', ev.points, count(*)::int
      from effective_votes ev
      group by ev.voter_id, ev.points
    `);
    return;
  }

  if (stepId === "relationship-pairs") {
    await tx.execute(sql`delete from analytics_relationship_pairs`);
    await tx.execute(sql`
      insert into analytics_relationship_pairs (
        direction, left_id, left_name, right_id, right_name, points,
        opportunities, shared_rounds, scope_rounds,
        points_per_opportunity, positive_rate
      )
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)},
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
    return;
  }

  if (stepId === "relationship-mutual") {
    await tx.execute(sql`delete from analytics_relationship_mutual`);
    await tx.execute(sql`
      insert into analytics_relationship_mutual (
        left_id, left_name, right_id, right_name, points, opportunities,
        shared_rounds, scope_rounds, points_per_opportunity,
        positive_rate, ballot_point_share
      )
      with ${voteOpportunityCtes(ALL_LEAGUES_FILTER)},
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
    return;
  }

  if (stepId === "relationship-alignment") {
    await tx.execute(sql`delete from analytics_relationship_alignment`);
    await tx.execute(sql`
      insert into analytics_relationship_alignment (
        left_id, left_name, right_id, right_name, alignment,
        comparable_features, shared_rounds, scope_rounds
      )
      with ${alignmentComparisonCtes(ALL_LEAGUES_FILTER)}
      select
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
    return;
  }

  if (stepId === "player-timing") {
    await tx.execute(sql`delete from analytics_player_timing`);
    await tx.execute(sql`
      insert into analytics_player_timing (
        player_id, player_name, round_id, round_name, league_name, league_slug,
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

  if (stepId === "finalize") {
    return;
  }
}
