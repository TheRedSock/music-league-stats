import { z } from "zod";

export const importKinds = [
  "competitors",
  "rounds",
  "submissions",
  "votes",
] as const;

export type ImportKind = (typeof importKinds)[number];

export const requiredCsvHeaders: Record<ImportKind, readonly string[]> = {
  competitors: ["ID", "Name"],
  rounds: ["ID", "Created", "Name", "Description", "Playlist URL"],
  submissions: [
    "Spotify URI",
    "Title",
    "Album",
    "Artist(s)",
    "Submitter ID",
    "Created",
    "Comment",
    "Round ID",
    "Visible To Voters",
  ],
  votes: [
    "Spotify URI",
    "Voter ID",
    "Created",
    "Points Assigned",
    "Comment",
    "Round ID",
  ],
};

const requiredText = z.string().trim().min(1);
const optionalText = z.string().nullable();
const sourceTimestamp = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => value.includes("T") && !Number.isNaN(Date.parse(value)),
    "Must be an ISO-like timestamp with a date and time",
  );

export const competitorRowSchema = z
  .object({
    sourceCompetitorId: requiredText,
    name: requiredText,
  })
  .strict();

export const roundRowSchema = z
  .object({
    sourceRoundId: requiredText,
    created: sourceTimestamp,
    name: requiredText,
    description: optionalText,
    playlistUrl: optionalText,
    ordinal: z.number().int().positive(),
  })
  .strict();

export const submissionRowSchema = z
  .object({
    spotifyUri: requiredText,
    title: requiredText,
    album: optionalText,
    artists: requiredText,
    submitterId: requiredText,
    created: sourceTimestamp,
    comment: optionalText,
    roundId: requiredText,
    visibleToVoters: z.boolean(),
  })
  .strict();

export const voteRowSchema = z
  .object({
    spotifyUri: requiredText,
    voterId: requiredText,
    created: sourceTimestamp,
    points: z.number().int().nonnegative(),
    comment: optionalText,
    roundId: requiredText,
  })
  .strict();

export const importRowSchemas = {
  competitors: competitorRowSchema,
  rounds: roundRowSchema,
  submissions: submissionRowSchema,
  votes: voteRowSchema,
} satisfies Record<ImportKind, z.ZodType>;

const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const importFileManifestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    rowCount: z.number().int().nonnegative(),
    chunkCount: z.number().int().nonnegative(),
    checksum: checksumSchema,
  })
  .strict()
  .refine(
    ({ rowCount, chunkCount }) =>
      (rowCount === 0 && chunkCount === 0) ||
      (rowCount > 0 && chunkCount > 0),
    "Empty files must have zero chunks; non-empty files must have chunks",
  );

export const importManifestSchema = z
  .object({
    competitors: importFileManifestSchema,
    rounds: importFileManifestSchema,
    submissions: importFileManifestSchema,
    votes: importFileManifestSchema,
  })
  .strict();

export const createImportBatchSchema = z
  .object({
    leagueId: z.uuid(),
    checksum: checksumSchema,
    manifest: importManifestSchema,
  })
  .strict();

export const importChunkSchema = z
  .object({
    kind: z.enum(importKinds),
    index: z.number().int().nonnegative(),
    startRow: z.number().int().nonnegative(),
    hash: checksumSchema,
    rows: z.array(z.unknown()).min(1).max(500),
  })
  .strict();

export type CompetitorImportRow = z.infer<typeof competitorRowSchema>;
export type RoundImportRow = z.infer<typeof roundRowSchema>;
export type SubmissionImportRow = z.infer<typeof submissionRowSchema>;
export type VoteImportRow = z.infer<typeof voteRowSchema>;
export type ImportManifest = z.infer<typeof importManifestSchema>;

export type CanonicalImportRows = {
  competitors: CompetitorImportRow[];
  rounds: RoundImportRow[];
  submissions: SubmissionImportRow[];
  votes: VoteImportRow[];
};

function nullable(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "no") return false;
  throw new Error(`Expected Yes or No, received "${value}"`);
}

function parsePoints(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Expected a non-negative integer, received "${value}"`);
  }
  return Number(normalized);
}

export function normalizeCsvHeaders(headers: string[]): string[] {
  return headers.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
}

export function validateCsvHeaders(
  kind: ImportKind,
  headers: string[] | undefined,
): void {
  const actual = normalizeCsvHeaders(headers ?? []);
  const expected = requiredCsvHeaders[kind];
  if (
    actual.length !== expected.length ||
    expected.some((header, index) => actual[index] !== header)
  ) {
    throw new Error(
      `${kind}.csv must have exactly these headers in order: ${expected.join(", ")}`,
    );
  }
}

export function canonicalizeCsvRow(
  kind: ImportKind,
  row: Record<string, string>,
  rowIndex: number,
):
  | CompetitorImportRow
  | RoundImportRow
  | SubmissionImportRow
  | VoteImportRow {
  let candidate: unknown;

  switch (kind) {
    case "competitors":
      candidate = {
        sourceCompetitorId: row.ID,
        name: row.Name,
      };
      break;
    case "rounds":
      candidate = {
        sourceRoundId: row.ID,
        created: row.Created,
        name: row.Name,
        description: nullable(row.Description),
        playlistUrl: nullable(row["Playlist URL"]),
        ordinal: rowIndex + 1,
      };
      break;
    case "submissions":
      candidate = {
        spotifyUri: row["Spotify URI"]?.trim(),
        title: row.Title,
        album: nullable(row.Album),
        artists: row["Artist(s)"],
        submitterId: row["Submitter ID"]?.trim(),
        created: row.Created,
        comment: nullable(row.Comment),
        roundId: row["Round ID"]?.trim(),
        visibleToVoters: parseBoolean(row["Visible To Voters"]),
      };
      break;
    case "votes":
      candidate = {
        spotifyUri: row["Spotify URI"]?.trim(),
        voterId: row["Voter ID"]?.trim(),
        created: row.Created,
        points: parsePoints(row["Points Assigned"]),
        comment: nullable(row.Comment),
        roundId: row["Round ID"]?.trim(),
      };
      break;
  }

  const result = importRowSchemas[kind].safeParse(candidate);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${kind}.csv row ${rowIndex + 2}: ${message}`);
  }
  return result.data as
    | CompetitorImportRow
    | RoundImportRow
    | SubmissionImportRow
    | VoteImportRow;
}

export function sourceSubmissionId(
  roundSourceId: string,
  spotifyUri: string,
): string {
  return JSON.stringify([roundSourceId, spotifyUri]);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}
