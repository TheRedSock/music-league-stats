import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  competitors,
  importBatches,
  importChunks,
  importStagingRows,
  leagueMembers,
  rounds,
  submissions,
  votes,
  type ImportSummary,
} from "@/db/schema";
import {
  competitorRowSchema,
  importKinds,
  roundRowSchema,
  sourceSubmissionId,
  submissionRowSchema,
  voteRowSchema,
  type CompetitorImportRow,
  type RoundImportRow,
  type SubmissionImportRow,
  type VoteImportRow,
} from "@/lib/import-data";
import { sha256Json } from "@/lib/server-hash";

export class ImportCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportCommitError";
  }
}

type ParsedRows = {
  competitors: CompetitorImportRow[];
  rounds: RoundImportRow[];
  submissions: SubmissionImportRow[];
  votes: VoteImportRow[];
};
type ImportBatchRecord = typeof importBatches.$inferSelect;

function deduplicate<T>(
  rows: T[],
  keyFor: (row: T) => string,
  label: string,
): T[] {
  const unique = new Map<string, { row: T; fingerprint: string }>();
  for (const row of rows) {
    const key = keyFor(row);
    const fingerprint = JSON.stringify(row);
    const existing = unique.get(key);
    if (existing && existing.fingerprint !== fingerprint) {
      throw new ImportCommitError(
        `Conflicting duplicate ${label} "${key}" was found.`,
      );
    }
    if (!existing) unique.set(key, { row, fingerprint });
  }
  return [...unique.values()].map(({ row }) => row);
}

function parseRows(
  rows: Array<typeof importStagingRows.$inferSelect>,
): ParsedRows {
  const result: ParsedRows = {
    competitors: [],
    rounds: [],
    submissions: [],
    votes: [],
  };
  for (const row of rows) {
    const parsed = {
      competitors: competitorRowSchema,
      rounds: roundRowSchema,
      submissions: submissionRowSchema,
      votes: voteRowSchema,
    }[row.kind].safeParse(row.sourceRow);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new ImportCommitError(
        `${row.kind} data row ${row.rowIndex + 1} is invalid: ${details}`,
      );
    }
    if (sha256Json(parsed.data) !== row.rowHash) {
      throw new ImportCommitError(
        `${row.kind} data row ${row.rowIndex + 1} failed its integrity check.`,
      );
    }
    if (
      row.kind === "rounds" &&
      (parsed.data as RoundImportRow).ordinal !== row.rowIndex + 1
    ) {
      throw new ImportCommitError(
        `Round data row ${row.rowIndex + 1} has an invalid ordinal.`,
      );
    }
    (result[row.kind] as unknown[]).push(parsed.data);
  }
  return result;
}

function validateCompleteness(
  manifest: ImportBatchRecord["manifest"],
  chunks: Array<typeof importChunks.$inferSelect>,
): void {
  for (const kind of importKinds) {
    const expected = manifest[kind];
    const actual = chunks
      .filter((chunk) => chunk.kind === kind)
      .sort((left, right) => left.chunkIndex - right.chunkIndex);
    if (actual.length !== expected.chunkCount) {
      throw new ImportCommitError(
        `${kind}: received ${actual.length} of ${expected.chunkCount} chunks.`,
      );
    }
    let nextRow = 0;
    for (let index = 0; index < actual.length; index += 1) {
      const chunk = actual[index];
      if (chunk.chunkIndex !== index || chunk.startRow !== nextRow) {
        throw new ImportCommitError(
          `${kind}: chunks are missing, duplicated, or out of order.`,
        );
      }
      nextRow += chunk.rowCount;
    }
    if (nextRow !== expected.rowCount) {
      throw new ImportCommitError(
        `${kind}: received ${nextRow} of ${expected.rowCount} rows.`,
      );
    }
  }
}

function validateReferences(rows: ParsedRows): ParsedRows {
  const unique: ParsedRows = {
    competitors: deduplicate(
      rows.competitors,
      (row) => row.sourceCompetitorId,
      "competitor ID",
    ),
    rounds: deduplicate(
      rows.rounds,
      (row) => row.sourceRoundId,
      "round ID",
    ),
    submissions: deduplicate(
      rows.submissions,
      (row) => sourceSubmissionId(row.roundId, row.spotifyUri),
      "submission",
    ),
    votes: deduplicate(
      rows.votes,
      (row) => JSON.stringify([row.roundId, row.spotifyUri, row.voterId]),
      "vote",
    ),
  };

  const competitorIds = new Set(
    unique.competitors.map((row) => row.sourceCompetitorId),
  );
  const roundIds = new Set(unique.rounds.map((row) => row.sourceRoundId));
  const submissionIds = new Set(
    unique.submissions.map((row) =>
      sourceSubmissionId(row.roundId, row.spotifyUri),
    ),
  );
  const ordinals = new Set<number>();

  for (const round of unique.rounds) {
    if (ordinals.has(round.ordinal)) {
      throw new ImportCommitError(
        `More than one round has ordinal ${round.ordinal}.`,
      );
    }
    ordinals.add(round.ordinal);
  }
  for (const submission of unique.submissions) {
    if (!roundIds.has(submission.roundId)) {
      throw new ImportCommitError(
        `Submission "${submission.spotifyUri}" references unknown round ID "${submission.roundId}".`,
      );
    }
    if (!competitorIds.has(submission.submitterId)) {
      throw new ImportCommitError(
        `Submission "${submission.spotifyUri}" references unknown submitter ID "${submission.submitterId}".`,
      );
    }
  }
  for (const vote of unique.votes) {
    if (!roundIds.has(vote.roundId)) {
      throw new ImportCommitError(
        `Vote by "${vote.voterId}" references unknown round ID "${vote.roundId}".`,
      );
    }
    if (!competitorIds.has(vote.voterId)) {
      throw new ImportCommitError(
        `Vote references unknown voter ID "${vote.voterId}".`,
      );
    }
    if (!submissionIds.has(sourceSubmissionId(vote.roundId, vote.spotifyUri))) {
      throw new ImportCommitError(
        `Vote by "${vote.voterId}" references unknown submission "${vote.spotifyUri}" in round "${vote.roundId}".`,
      );
    }
  }
  return unique;
}

function batches<T>(values: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function commitImportBatch(
  batchId: string,
): Promise<ImportSummary> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1)
      .for("update");
    if (!batch) throw new ImportCommitError("Import batch not found.");
    if (batch.status === "completed" && batch.summary) return batch.summary;
    if (batch.status === "processing") {
      throw new ImportCommitError("This import is already being committed.");
    }

    const chunkRows = await tx
      .select()
      .from(importChunks)
      .where(eq(importChunks.batchId, batchId));
    validateCompleteness(batch.manifest, chunkRows);
    const stagingRows = await tx
      .select()
      .from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(
        asc(importStagingRows.kind),
        asc(importStagingRows.rowIndex),
      );
    const expectedRows = Object.values(batch.manifest).reduce(
      (total, file) => total + file.rowCount,
      0,
    );
    if (stagingRows.length !== expectedRows) {
      throw new ImportCommitError(
        `Received ${stagingRows.length} of ${expectedRows} staged rows.`,
      );
    }
    const parsedRows = parseRows(stagingRows);
    for (const kind of importKinds) {
      if (sha256Json(parsedRows[kind]) !== batch.manifest[kind].checksum) {
        throw new ImportCommitError(
          `${kind}: staged rows do not match the declared file checksum.`,
        );
      }
    }
    const imported = validateReferences(parsedRows);

    await tx
      .update(importBatches)
      .set({
        status: "processing",
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batchId));

    for (const group of batches(imported.competitors)) {
      await tx
        .insert(competitors)
        .values(
          group.map((row) => ({
            sourceCompetitorId: row.sourceCompetitorId,
            name: row.name,
          })),
        )
        .onConflictDoUpdate({
          target: competitors.sourceCompetitorId,
          set: {
            name: sql`excluded.name`,
            updatedAt: sql`now()`,
          },
        });
    }
    const competitorRecords = imported.competitors.length
      ? await tx
          .select({
            id: competitors.id,
            sourceCompetitorId: competitors.sourceCompetitorId,
          })
          .from(competitors)
          .where(
            inArray(
              competitors.sourceCompetitorId,
              imported.competitors.map((row) => row.sourceCompetitorId),
            ),
          )
      : [];
    const competitorIds = new Map(
      competitorRecords.map((row) => [row.sourceCompetitorId, row.id]),
    );

    for (const group of batches(imported.competitors)) {
      await tx
        .insert(leagueMembers)
        .values(
          group.map((row) => ({
            leagueId: batch.leagueId,
            competitorId: competitorIds.get(row.sourceCompetitorId)!,
            displayName: row.name,
          })),
        )
        .onConflictDoUpdate({
          target: [leagueMembers.leagueId, leagueMembers.competitorId],
          set: {
            displayName: sql`excluded.display_name`,
            updatedAt: sql`now()`,
          },
        });
    }

    for (const group of batches(imported.rounds)) {
      await tx
        .insert(rounds)
        .values(
          group.map((row) => ({
            leagueId: batch.leagueId,
            sourceRoundId: row.sourceRoundId,
            ordinal: row.ordinal,
            name: row.name,
            description: row.description,
            playlistUrl: row.playlistUrl,
            sourceCreatedAt: new Date(row.created),
          })),
        )
        .onConflictDoUpdate({
          target: [rounds.leagueId, rounds.sourceRoundId],
          set: {
            ordinal: sql`excluded.ordinal`,
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            playlistUrl: sql`excluded.playlist_url`,
            sourceCreatedAt: sql`excluded.source_created_at`,
            updatedAt: sql`now()`,
          },
        });
    }
    const roundRecords = imported.rounds.length
      ? await tx
          .select({ id: rounds.id, sourceRoundId: rounds.sourceRoundId })
          .from(rounds)
          .where(
            and(
              eq(rounds.leagueId, batch.leagueId),
              inArray(
                rounds.sourceRoundId,
                imported.rounds.map((row) => row.sourceRoundId),
              ),
            ),
          )
      : [];
    const roundIds = new Map(
      roundRecords.map((row) => [row.sourceRoundId, row.id]),
    );

    const playlistIndexBySubmission = new Map<string, number>();
    const playlistCounters = new Map<string, number>();
    for (const row of imported.submissions) {
      const key = sourceSubmissionId(row.roundId, row.spotifyUri);
      if (playlistIndexBySubmission.has(key)) continue;
      const nextIndex = playlistCounters.get(row.roundId) ?? 0;
      playlistIndexBySubmission.set(key, nextIndex);
      playlistCounters.set(row.roundId, nextIndex + 1);
    }

    for (const group of batches(imported.submissions)) {
      await tx
        .insert(submissions)
        .values(
          group.map((row) => {
            const key = sourceSubmissionId(row.roundId, row.spotifyUri);
            return {
              leagueId: batch.leagueId,
              roundId: roundIds.get(row.roundId)!,
              sourceSubmissionId: key,
              submitterId: competitorIds.get(row.submitterId)!,
              spotifyUri: row.spotifyUri,
              songTitle: row.title,
              artistName: row.artists,
              albumName: row.album,
              comment: row.comment,
              submittedAt: new Date(row.created),
              playlistIndex: playlistIndexBySubmission.get(key) ?? 0,
              visibleToVoters: row.visibleToVoters,
            };
          }),
        )
        .onConflictDoUpdate({
          target: [submissions.roundId, submissions.spotifyUri],
          set: {
            sourceSubmissionId: sql`excluded.source_submission_id`,
            submitterId: sql`excluded.submitter_id`,
            songTitle: sql`excluded.song_title`,
            artistName: sql`excluded.artist_name`,
            albumName: sql`excluded.album_name`,
            comment: sql`excluded.comment`,
            submittedAt: sql`excluded.submitted_at`,
            playlistIndex: sql`excluded.playlist_index`,
            visibleToVoters: sql`excluded.visible_to_voters`,
            updatedAt: sql`now()`,
          },
        });
    }
    const submissionRecords = roundRecords.length
      ? await tx
          .select({
            id: submissions.id,
            roundId: submissions.roundId,
            spotifyUri: submissions.spotifyUri,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.leagueId, batch.leagueId),
              inArray(
                submissions.roundId,
                roundRecords.map((round) => round.id),
              ),
            ),
          )
      : [];
    const submissionIds = new Map(
      submissionRecords.map((row) => [
        JSON.stringify([row.roundId, row.spotifyUri]),
        row.id,
      ]),
    );

    for (const group of batches(imported.votes)) {
      await tx
        .insert(votes)
        .values(
          group.map((row) => {
            const roundId = roundIds.get(row.roundId)!;
            return {
              leagueId: batch.leagueId,
              roundId,
              submissionId: submissionIds.get(
                JSON.stringify([roundId, row.spotifyUri]),
              )!,
              voterId: competitorIds.get(row.voterId)!,
              points: row.points,
              comment: row.comment,
              castAt: new Date(row.created),
            };
          }),
        )
        .onConflictDoUpdate({
          target: [votes.roundId, votes.submissionId, votes.voterId],
          set: {
            points: sql`excluded.points`,
            comment: sql`excluded.comment`,
            castAt: sql`excluded.cast_at`,
            updatedAt: sql`now()`,
          },
        });
    }

    const summary: ImportSummary = {
      competitors: imported.competitors.length,
      memberships: imported.competitors.length,
      rounds: imported.rounds.length,
      submissions: imported.submissions.length,
      votes: imported.votes.length,
    };
    await tx
      .update(importBatches)
      .set({
        status: "completed",
        summary,
        errorMessage: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batchId));
    return summary;
  });
}

export async function markImportFailed(
  batchId: string,
  message: string,
): Promise<void> {
  await db
    .update(importBatches)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 2000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(importBatches.id, batchId),
        inArray(importBatches.status, ["pending", "failed"]),
      ),
    );
}
