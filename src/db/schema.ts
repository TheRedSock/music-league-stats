import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const leagueStatus = pgEnum("league_status", ["active", "ended"]);
export const importStatus = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const importKind = pgEnum("import_kind", [
  "competitors",
  "rounds",
  "submissions",
  "votes",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceLeagueId: text("source_league_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    totalRounds: integer("total_rounds").notNull(),
    maxPlayers: integer("max_players").notNull(),
    songsPerPlayerPerRound: integer("songs_per_player_per_round").notNull(),
    status: leagueStatus("status").default("active").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leagues_source_id_unique").on(table.sourceLeagueId),
    uniqueIndex("leagues_slug_unique").on(table.slug),
    index("leagues_status_idx").on(table.status),
    check("leagues_total_rounds_positive", sql`${table.totalRounds} > 0`),
    check("leagues_max_players_positive", sql`${table.maxPlayers} > 0`),
    check(
      "leagues_songs_per_player_positive",
      sql`${table.songsPerPlayerPerRound} > 0`,
    ),
    check(
      "leagues_dates_ordered",
      sql`${table.endDate} is null or ${table.startDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceCompetitorId: text("source_competitor_id").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("competitors_source_id_unique").on(table.sourceCompetitorId),
    index("competitors_name_idx").on(table.name),
  ],
);

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "restrict" }),
    displayName: text("display_name"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "league_members_pk",
      columns: [table.leagueId, table.competitorId],
    }),
    index("league_members_competitor_idx").on(table.competitorId),
  ],
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    sourceRoundId: text("source_round_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    playlistUrl: text("playlist_url"),
    sourceCreatedAt: timestamp("source_created_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rounds_league_source_id_unique").on(
      table.leagueId,
      table.sourceRoundId,
    ),
    uniqueIndex("rounds_league_ordinal_unique").on(
      table.leagueId,
      table.ordinal,
    ),
    unique("rounds_id_league_unique").on(table.id, table.leagueId),
    index("rounds_league_idx").on(table.leagueId),
    check("rounds_ordinal_positive", sql`${table.ordinal} > 0`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id").notNull(),
    roundId: uuid("round_id").notNull(),
    sourceSubmissionId: text("source_submission_id").notNull(),
    submitterId: uuid("submitter_id").notNull(),
    spotifyUri: text("spotify_uri").notNull(),
    songTitle: text("song_title").notNull(),
    artistName: text("artist_name").notNull(),
    albumName: text("album_name"),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    visibleToVoters: boolean("visible_to_voters").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("submissions_round_source_id_unique").on(
      table.roundId,
      table.sourceSubmissionId,
    ),
    uniqueIndex("submissions_round_spotify_uri_unique").on(
      table.roundId,
      table.spotifyUri,
    ),
    unique("submissions_id_round_unique").on(table.id, table.roundId),
    index("submissions_round_idx").on(table.roundId),
    index("submissions_submitter_idx").on(
      table.leagueId,
      table.submitterId,
    ),
    index("submissions_spotify_uri_idx").on(table.spotifyUri),
    foreignKey({
      name: "submissions_round_league_fk",
      columns: [table.roundId, table.leagueId],
      foreignColumns: [rounds.id, rounds.leagueId],
    }).onDelete("cascade"),
    foreignKey({
      name: "submissions_submitter_membership_fk",
      columns: [table.leagueId, table.submitterId],
      foreignColumns: [leagueMembers.leagueId, leagueMembers.competitorId],
    }).onDelete("restrict"),
  ],
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id").notNull(),
    roundId: uuid("round_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    voterId: uuid("voter_id").notNull(),
    points: integer("points").notNull(),
    comment: text("comment"),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("votes_round_submission_voter_unique").on(
      table.roundId,
      table.submissionId,
      table.voterId,
    ),
    index("votes_submission_idx").on(table.submissionId),
    index("votes_voter_idx").on(table.leagueId, table.voterId),
    foreignKey({
      name: "votes_round_league_fk",
      columns: [table.roundId, table.leagueId],
      foreignColumns: [rounds.id, rounds.leagueId],
    }).onDelete("cascade"),
    foreignKey({
      name: "votes_submission_round_fk",
      columns: [table.submissionId, table.roundId],
      foreignColumns: [submissions.id, submissions.roundId],
    }).onDelete("cascade"),
    foreignKey({
      name: "votes_voter_membership_fk",
      columns: [table.leagueId, table.voterId],
      foreignColumns: [leagueMembers.leagueId, leagueMembers.competitorId],
    }).onDelete("restrict"),
    check("votes_points_nonnegative", sql`${table.points} >= 0`),
  ],
);

export const importKinds = [
  "competitors",
  "rounds",
  "submissions",
  "votes",
] as const;
export type ImportKind = (typeof importKinds)[number];

export type ImportFileManifest = {
  fileName: string;
  rowCount: number;
  chunkCount: number;
  checksum: string;
};

export type ImportManifest = Record<ImportKind, ImportFileManifest>;

export type ImportSummary = {
  competitors: number;
  memberships: number;
  rounds: number;
  submissions: number;
  votes: number;
};

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "restrict" }),
    manifest: jsonb("manifest").$type<ImportManifest>().notNull(),
    checksum: text("checksum").notNull(),
    status: importStatus("status").default("pending").notNull(),
    summary: jsonb("summary").$type<ImportSummary>(),
    errorMessage: text("error_message"),
    receivedRows: integer("received_rows").default(0).notNull(),
    receivedChunks: integer("received_chunks").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("import_batches_league_checksum_unique").on(
      table.leagueId,
      table.checksum,
    ),
    index("import_batches_status_idx").on(table.status),
    index("import_batches_created_at_idx").on(table.createdAt),
    check(
      "import_batches_received_rows_nonnegative",
      sql`${table.receivedRows} >= 0`,
    ),
    check(
      "import_batches_received_chunks_nonnegative",
      sql`${table.receivedChunks} >= 0`,
    ),
    check(
      "import_batches_timestamps_ordered",
      sql`${table.completedAt} is null or ${table.startedAt} is null or ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const importChunks = pgTable(
  "import_chunks",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    kind: importKind("kind").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    startRow: integer("start_row").notNull(),
    rowCount: integer("row_count").notNull(),
    byteSize: integer("byte_size").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "import_chunks_pk",
      columns: [table.batchId, table.kind, table.chunkIndex],
    }),
    index("import_chunks_batch_idx").on(table.batchId),
    check("import_chunks_index_nonnegative", sql`${table.chunkIndex} >= 0`),
    check("import_chunks_start_row_nonnegative", sql`${table.startRow} >= 0`),
    check("import_chunks_row_count_positive", sql`${table.rowCount} > 0`),
    check("import_chunks_byte_size_positive", sql`${table.byteSize} > 0`),
  ],
);

export const importStagingRows = pgTable(
  "import_staging_rows",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    kind: importKind("kind").notNull(),
    rowIndex: integer("row_index").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    sourceRow: jsonb("source_row").$type<Record<string, unknown>>().notNull(),
    rowHash: text("row_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "import_staging_rows_pk",
      columns: [table.batchId, table.kind, table.rowIndex],
    }),
    index("import_staging_rows_batch_kind_idx").on(
      table.batchId,
      table.kind,
    ),
    check("import_staging_rows_index_nonnegative", sql`${table.rowIndex} >= 0`),
    check(
      "import_staging_rows_chunk_index_nonnegative",
      sql`${table.chunkIndex} >= 0`,
    ),
  ],
);

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
