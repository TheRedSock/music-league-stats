import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, type Database } from "@/db";
import {
  spotifyEnrichmentJobs,
  spotifyTrackArtists,
  spotifyTrackEnrichments,
  type SpotifyEnrichmentCompletedSummary,
  type SpotifyEnrichmentJob,
  type SpotifyEnrichmentJobSummary,
  type SpotifyEnrichmentProgress,
} from "@/db/schema";
import { revalidateAnalyticsCache } from "@/lib/analytics";
import {
  fetchTracksByIds,
  type SpotifyTrackResult,
  SpotifyBudgetExceededError,
  SpotifyConfigError,
  SPOTIFY_MAX_IDS_PER_REQUEST,
} from "@/lib/spotify";

const ENRICHMENT_LOCK_KEY = 73_730_011;
/** Keep each advance under typical serverless limits. */
const ADVANCE_BUDGET_MS = 8_000;
/** One Spotify batch per advance — avoids long per-track DB write loops. */
const IDS_PER_ADVANCE = SPOTIFY_MAX_IDS_PER_REQUEST;

/**
 * Music League CSV artist strings that look like multi-credit / collab labels.
 * False positives (e.g. "Tyler, The Creator") are fine — Spotify normalizes them.
 */
export const AMBIGUOUS_ARTIST_SQL = sql`
  artist_name ~* '(,|&|/)|(^|[[:space:]])(feat\\.?|ft\\.?|featuring|with)([[:space:]]|$)'
`;

export type SpotifyEnrichmentCounts = {
  enrichedOk: number;
  pending: number;
  notFound: number;
  error: number;
  ambiguousPending: number;
  allPending: number;
};

export type SpotifyEnrichmentStatus = {
  status: "missing" | SpotifyEnrichmentJob["status"];
  counts: SpotifyEnrichmentCounts;
  progress: SpotifyEnrichmentProgress | null;
  job: SpotifyEnrichmentJob | null;
};

function progressFromSummary(
  summary: SpotifyEnrichmentJobSummary | null | undefined,
): SpotifyEnrichmentProgress | null {
  if (summary && "kind" in summary && summary.kind === "progress") {
    return summary;
  }
  return null;
}

function emptyCounts(): SpotifyEnrichmentCounts {
  return {
    enrichedOk: 0,
    pending: 0,
    notFound: 0,
    error: 0,
    ambiguousPending: 0,
    allPending: 0,
  };
}

export async function getSpotifyEnrichmentTableCounts(
  database: Database = db,
): Promise<Pick<SpotifyEnrichmentCounts, "enrichedOk" | "pending" | "notFound" | "error">> {
  const [row] = await database.execute<{
    enriched_ok: number;
    pending: number;
    not_found: number;
    error: number;
  }>(sql`
    select
      count(*) filter (where status = 'ok')::int as enriched_ok,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'not_found')::int as not_found,
      count(*) filter (where status = 'error')::int as error
    from spotify_track_enrichments
  `);
  return {
    enrichedOk: row?.enriched_ok ?? 0,
    pending: row?.pending ?? 0,
    notFound: row?.not_found ?? 0,
    error: row?.error ?? 0,
  };
}

export async function getSpotifyEnrichmentCounts(
  database: Database = db,
): Promise<SpotifyEnrichmentCounts> {
  const [row] = await database.execute<{
    enriched_ok: number;
    pending: number;
    not_found: number;
    error: number;
    ambiguous_pending: number;
    all_pending: number;
  }>(sql`
    with track_ids as (
      select
        substring(s.spotify_uri from '^spotify:track:([A-Za-z0-9]+)$') as spotify_track_id,
        bool_or(${AMBIGUOUS_ARTIST_SQL}) as is_ambiguous
      from submissions s
      where s.spotify_uri ~ '^spotify:track:[A-Za-z0-9]+$'
      group by 1
    ),
    needs as (
      select
        t.spotify_track_id,
        t.is_ambiguous,
        e.status
      from track_ids t
      left join spotify_track_enrichments e
        on e.spotify_track_id = t.spotify_track_id
    )
    select
      (select count(*)::int from spotify_track_enrichments where status = 'ok') as enriched_ok,
      (select count(*)::int from spotify_track_enrichments where status = 'pending') as pending,
      (select count(*)::int from spotify_track_enrichments where status = 'not_found') as not_found,
      (select count(*)::int from spotify_track_enrichments where status = 'error') as error,
      (
        select count(*)::int
        from needs
        where is_ambiguous
          and (status is null or status <> 'ok')
      ) as ambiguous_pending,
      (
        select count(*)::int
        from needs
        where status is null or status <> 'ok'
      ) as all_pending
  `);

  if (!row) return emptyCounts();
  return {
    enrichedOk: row.enriched_ok,
    pending: row.pending,
    notFound: row.not_found,
    error: row.error,
    ambiguousPending: row.ambiguous_pending,
    allPending: row.all_pending,
  };
}

export async function getSpotifyEnrichmentStatus(
  database: Database = db,
): Promise<SpotifyEnrichmentStatus> {
  const [counts, jobs] = await Promise.all([
    getSpotifyEnrichmentCounts(database),
    database
      .select()
      .from(spotifyEnrichmentJobs)
      .orderBy(desc(spotifyEnrichmentJobs.createdAt))
      .limit(1),
  ]);
  const job = jobs[0] ?? null;
  return {
    counts,
    job,
    progress: progressFromSummary(job?.summary),
    status: job ? job.status : "missing",
  };
}

async function seedPendingTracks(
  database: Pick<Database, "execute">,
  ambiguousOnly: boolean,
): Promise<number> {
  const ambiguousFilter = ambiguousOnly
    ? sql`and ${AMBIGUOUS_ARTIST_SQL}`
    : sql``;

  const result = await database.execute<{ spotify_track_id: string }>(sql`
    with candidates as (
      select distinct
        substring(s.spotify_uri from '^spotify:track:([A-Za-z0-9]+)$') as spotify_track_id
      from submissions s
      where s.spotify_uri ~ '^spotify:track:[A-Za-z0-9]+$'
        ${ambiguousFilter}
    )
    insert into spotify_track_enrichments (spotify_track_id, status, error_message, updated_at)
    select
      c.spotify_track_id,
      'pending',
      null,
      now()
    from candidates c
    left join spotify_track_enrichments e
      on e.spotify_track_id = c.spotify_track_id
    where c.spotify_track_id is not null
      and (e.spotify_track_id is null or e.status <> 'ok')
    on conflict (spotify_track_id) do update
      set
        status = 'pending',
        error_message = null,
        updated_at = now()
      where spotify_track_enrichments.status <> 'ok'
    returning spotify_track_id
  `);

  return result.length;
}

function progressSummary(partial: {
  message: string;
  processed: number;
  total: number;
  ok: number;
  notFound: number;
  error: number;
  waitingMs?: number;
}): SpotifyEnrichmentProgress {
  return {
    kind: "progress",
    ...partial,
  };
}

async function markJob(
  database: Database,
  jobId: string,
  update: {
    status: "completed" | "failed";
    errorMessage?: string | null;
    summary?: SpotifyEnrichmentJobSummary | null;
  },
): Promise<SpotifyEnrichmentJob> {
  const [job] = await database
    .update(spotifyEnrichmentJobs)
    .set({
      completedAt: new Date(),
      errorMessage: update.errorMessage ?? null,
      status: update.status,
      summary: update.summary ?? null,
      updatedAt: new Date(),
    })
    .where(eq(spotifyEnrichmentJobs.id, jobId))
    .returning();
  return job!;
}

export async function startSpotifyEnrichmentJob(
  ambiguousOnly = true,
  database: Database = db,
): Promise<SpotifyEnrichmentStatus> {
  const job = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ENRICHMENT_LOCK_KEY})`);

    await tx
      .update(spotifyEnrichmentJobs)
      .set({
        completedAt: new Date(),
        errorMessage: "Superseded by a newer Spotify enrich job.",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(spotifyEnrichmentJobs.status, "processing"));

    const seeded = await seedPendingTracks(tx, ambiguousOnly);
    const [pendingRow] = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count
      from spotify_track_enrichments
      where status = 'pending'
    `);
    const pending = pendingRow?.count ?? 0;

    const [created] = await tx
      .insert(spotifyEnrichmentJobs)
      .values({
        ambiguousOnly,
        startedAt: new Date(),
        status: "processing",
        summary: progressSummary({
          message:
            pending === 0
              ? "Nothing to enrich."
              : `Seeded ${seeded} track${seeded === 1 ? "" : "s"}; ${pending} pending.`,
          processed: 0,
          total: pending,
          ok: 0,
          notFound: 0,
          error: 0,
        }),
      })
      .returning();

    if (pending === 0) {
      const [completed] = await tx
        .update(spotifyEnrichmentJobs)
        .set({
          completedAt: new Date(),
          status: "completed",
          summary: {
            kind: "completed",
            processed: 0,
            ok: 0,
            notFound: 0,
            error: 0,
            ambiguousOnly,
          } satisfies SpotifyEnrichmentCompletedSummary,
          updatedAt: new Date(),
        })
        .where(eq(spotifyEnrichmentJobs.id, created.id))
        .returning();
      return completed;
    }

    return created;
  });

  return {
    ...(await getSpotifyEnrichmentStatus(database)),
    job,
    progress: progressFromSummary(job.summary),
    status: job.status,
  };
}

async function applyTrackResultsBatch(
  database: Database,
  entries: Array<{ id: string; track: SpotifyTrackResult | null }>,
): Promise<{ ok: number; notFound: number }> {
  if (entries.length === 0) return { ok: 0, notFound: 0 };

  return database.transaction(async (tx) => {
    const ids = entries.map((entry) => entry.id);
    await tx
      .delete(spotifyTrackArtists)
      .where(inArray(spotifyTrackArtists.spotifyTrackId, ids));

    const artistRows: Array<{
      artistName: string;
      artistSpotifyId: string;
      position: number;
      spotifyTrackId: string;
    }> = [];
    const okIds: string[] = [];
    const notFoundIds: string[] = [];

    for (const { id, track } of entries) {
      if (!track) {
        notFoundIds.push(id);
        continue;
      }
      okIds.push(id);
      for (const [position, artist] of track.artists.entries()) {
        artistRows.push({
          artistName: artist.name,
          artistSpotifyId: artist.id,
          position,
          spotifyTrackId: id,
        });
      }
    }

    if (artistRows.length > 0) {
      await tx.insert(spotifyTrackArtists).values(artistRows);
    }

    const now = new Date();
    if (okIds.length > 0) {
      await tx
        .update(spotifyTrackEnrichments)
        .set({
          enrichedAt: now,
          errorMessage: null,
          status: "ok",
          updatedAt: now,
        })
        .where(inArray(spotifyTrackEnrichments.spotifyTrackId, okIds));
    }
    if (notFoundIds.length > 0) {
      await tx
        .update(spotifyTrackEnrichments)
        .set({
          enrichedAt: now,
          errorMessage: "Track not found on Spotify.",
          status: "not_found",
          updatedAt: now,
        })
        .where(inArray(spotifyTrackEnrichments.spotifyTrackId, notFoundIds));
    }

    return { ok: okIds.length, notFound: notFoundIds.length };
  });
}

function revalidateAfterEnrich(): void {
  revalidateAnalyticsCache();
  revalidatePath("/facts");
  revalidatePath("/admin");
}

export async function advanceSpotifyEnrichmentJob(
  jobId: string,
  database: Database = db,
): Promise<SpotifyEnrichmentStatus> {
  const [job] = await database
    .select()
    .from(spotifyEnrichmentJobs)
    .where(eq(spotifyEnrichmentJobs.id, jobId))
    .limit(1);

  if (!job) {
    return getSpotifyEnrichmentStatus(database);
  }
  if (job.status !== "processing") {
    return {
      ...(await getSpotifyEnrichmentStatus(database)),
      job,
      progress: progressFromSummary(job.summary),
      status: job.status,
    };
  }

  const prior =
    job.summary && "kind" in job.summary && job.summary.kind === "progress"
      ? job.summary
      : null;
  const deadlineMs = Date.now() + ADVANCE_BUDGET_MS;

  try {
    const pendingRows = await database
      .select({ spotifyTrackId: spotifyTrackEnrichments.spotifyTrackId })
      .from(spotifyTrackEnrichments)
      .where(eq(spotifyTrackEnrichments.status, "pending"))
      .limit(IDS_PER_ADVANCE);

    if (pendingRows.length === 0) {
      const counts = await getSpotifyEnrichmentCounts(database);
      const completed = await markJob(database, jobId, {
        status: "completed",
        summary: {
          kind: "completed",
          processed: prior?.processed ?? counts.enrichedOk,
          ok: counts.enrichedOk,
          notFound: counts.notFound,
          error: counts.error,
          ambiguousOnly: job.ambiguousOnly,
        },
      });
      revalidateAfterEnrich();
      return {
        counts,
        job: completed,
        progress: null,
        status: "completed",
      };
    }

    const ids = pendingRows.map((row) => row.spotifyTrackId);

    let lastMessage = `Fetching ${ids.length} track${ids.length === 1 ? "" : "s"} from Spotify…`;
    await database
      .update(spotifyEnrichmentJobs)
      .set({
        summary: progressSummary({
          message: lastMessage,
          processed: prior?.processed ?? 0,
          total: prior?.total ?? ids.length,
          ok: prior?.ok ?? 0,
          notFound: prior?.notFound ?? 0,
          error: prior?.error ?? 0,
        }),
        updatedAt: new Date(),
      })
      .where(eq(spotifyEnrichmentJobs.id, jobId));

    const { results, remainingIds } = await fetchTracksByIds(ids, {
      deadlineMs,
      onWait: async (waitMs, reason) => {
        lastMessage = `Waiting ${Math.ceil(waitMs / 1000)}s for ${reason}…`;
        await database
          .update(spotifyEnrichmentJobs)
          .set({
            summary: progressSummary({
              message: lastMessage,
              processed: prior?.processed ?? 0,
              total: prior?.total ?? ids.length,
              ok: prior?.ok ?? 0,
              notFound: prior?.notFound ?? 0,
              error: prior?.error ?? 0,
              waitingMs: waitMs,
            }),
            updatedAt: new Date(),
          })
          .where(eq(spotifyEnrichmentJobs.id, jobId));
      },
    });

    const remaining = new Set(remainingIds);
    const entries = ids
      .filter((id) => !remaining.has(id) && results.has(id))
      .map((id) => ({ id, track: results.get(id) ?? null }));

    let okDelta = 0;
    let notFoundDelta = 0;
    let errorDelta = 0;
    try {
      const applied = await applyTrackResultsBatch(database, entries);
      okDelta = applied.ok;
      notFoundDelta = applied.notFound;
    } catch (error) {
      errorDelta = entries.length;
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
      const failedIds = entries.map((entry) => entry.id);
      if (failedIds.length > 0) {
        await database.transaction(async (tx) => {
          await tx
            .delete(spotifyTrackArtists)
            .where(inArray(spotifyTrackArtists.spotifyTrackId, failedIds));
          await tx
            .update(spotifyTrackEnrichments)
            .set({
              errorMessage: message,
              status: "error",
              updatedAt: new Date(),
            })
            .where(inArray(spotifyTrackEnrichments.spotifyTrackId, failedIds));
        });
      }
    }

    const processedDelta = okDelta + notFoundDelta + errorDelta;
    const tableCounts = await getSpotifyEnrichmentTableCounts(database);
    const pendingCount = tableCounts.pending;
    const stalledOnBudget =
      processedDelta === 0 && remainingIds.length > 0 && pendingCount > 0;
    const waitMs = stalledOnBudget ? 2_000 : undefined;
    const nextProgress = progressSummary({
      message: stalledOnBudget
        ? `Waiting ${Math.ceil((waitMs ?? 2_000) / 1000)}s for Spotify rate limit…`
        : pendingCount === 0
          ? "Finishing…"
          : `Enriched ${processedDelta} this step; ${pendingCount} pending.`,
      processed: (prior?.processed ?? 0) + processedDelta,
      total:
        (prior?.total ?? 0) ||
        (prior?.processed ?? 0) + processedDelta + pendingCount,
      ok: (prior?.ok ?? 0) + okDelta,
      notFound: (prior?.notFound ?? 0) + notFoundDelta,
      error: (prior?.error ?? 0) + errorDelta,
      waitingMs: waitMs,
    });

    if (pendingCount === 0) {
      const counts = await getSpotifyEnrichmentCounts(database);
      const completed = await markJob(database, jobId, {
        status: "completed",
        summary: {
          kind: "completed",
          processed: nextProgress.processed,
          ok: nextProgress.ok,
          notFound: nextProgress.notFound,
          error: nextProgress.error,
          ambiguousOnly: job.ambiguousOnly,
        },
      });
      revalidateAfterEnrich();
      return {
        counts,
        job: completed,
        progress: null,
        status: "completed",
      };
    }

    const [updated] = await database
      .update(spotifyEnrichmentJobs)
      .set({
        summary: nextProgress,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spotifyEnrichmentJobs.id, jobId),
          eq(spotifyEnrichmentJobs.status, "processing"),
        ),
      )
      .returning();

    return {
      counts: {
        enrichedOk: tableCounts.enrichedOk,
        pending: tableCounts.pending,
        notFound: tableCounts.notFound,
        error: tableCounts.error,
        // Candidate totals are only needed for the start UI; keep cheap mid-job.
        ambiguousPending: tableCounts.pending,
        allPending: tableCounts.pending,
      },
      job: updated ?? job,
      progress: nextProgress,
      status: "processing",
    };
  } catch (error) {
    if (error instanceof SpotifyBudgetExceededError) {
      const waitMs = Math.max(2_000, Math.min(30_000, error.waitMs || 2_000));
      const nextProgress = progressSummary({
        message: `Waiting ${Math.ceil(waitMs / 1000)}s for Spotify rate limit…`,
        processed: prior?.processed ?? 0,
        total: prior?.total ?? 0,
        ok: prior?.ok ?? 0,
        notFound: prior?.notFound ?? 0,
        error: prior?.error ?? 0,
        waitingMs: waitMs,
      });
      const [updated] = await database
        .update(spotifyEnrichmentJobs)
        .set({
          summary: nextProgress,
          updatedAt: new Date(),
        })
        .where(eq(spotifyEnrichmentJobs.id, jobId))
        .returning();
      const tableCounts = await getSpotifyEnrichmentTableCounts(database);
      return {
        counts: {
          enrichedOk: tableCounts.enrichedOk,
          pending: tableCounts.pending,
          notFound: tableCounts.notFound,
          error: tableCounts.error,
          ambiguousPending: tableCounts.pending,
          allPending: tableCounts.pending,
        },
        job: updated ?? job,
        progress: nextProgress,
        status: "processing",
      };
    }

    const message =
      error instanceof SpotifyConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Spotify enrich job failed.";
    const failed = await markJob(database, jobId, {
      status: "failed",
      errorMessage: message,
      summary: prior,
    });
    return {
      ...(await getSpotifyEnrichmentStatus(database)),
      job: failed,
      progress: null,
      status: "failed",
    };
  }
}

/** Exported for tests / diagnostics. */
export function isAmbiguousArtistName(artistName: string): boolean {
  return /(?:,|&|\/)|(?:^|\s)(?:feat\.?|ft\.?|featuring|with)(?:\s|$)/i.test(
    artistName,
  );
}
