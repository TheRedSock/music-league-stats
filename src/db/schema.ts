import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
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
export const analyticsMaterializationStatus = pgEnum(
  "analytics_materialization_status",
  ["pending", "processing", "completed", "failed"],
);
export const spotifyEnrichmentStatus = pgEnum("spotify_enrichment_status", [
  "pending",
  "ok",
  "not_found",
  "error",
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
    musicLeagueId: text("music_league_id"),
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
    uniqueIndex("leagues_music_league_id_unique").on(table.musicLeagueId),
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
    nameOverride: text("name_override"),
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
    /** 0-based slate/playlist order within the round, from submissions.csv row order. */
    playlistIndex: integer("playlist_index"),
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

export type AnalyticsMaterializationSummary = {
  songStats: number;
  playerStats: number;
  pointDistribution: number;
  playerPointDistribution: number;
  relationshipPairs: number;
  relationshipMutual: number;
  relationshipAlignment: number;
  playerTiming: number;
  effectiveVotes?: number;
  leagueScopes?: number;
};

export type AnalyticsMaterializationProgress = {
  kind: "progress";
  stepId: string;
  stepLabel: string;
  stepIndex: number;
  stepCount: number;
  leagueIndex?: number;
  leagueCount?: number;
};

export type AnalyticsMaterializationJobSummary =
  | (AnalyticsMaterializationSummary & { kind?: "completed" })
  | AnalyticsMaterializationProgress;

export const analyticsMaterializationJobs = pgTable(
  "analytics_materialization_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    analyticsRevision: text("analytics_revision").notNull(),
    status: analyticsMaterializationStatus("status")
      .default("pending")
      .notNull(),
    summary: jsonb("summary").$type<AnalyticsMaterializationJobSummary>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("analytics_jobs_revision_status_idx").on(
      table.analyticsRevision,
      table.status,
    ),
    index("analytics_jobs_created_at_idx").on(table.createdAt),
  ],
);

/** On-demand multi-league relationship/alignment materialization jobs. */
export const analyticsScopeJobs = pgTable(
  "analytics_scope_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    analyticsRevision: text("analytics_revision").notNull(),
    scopeKey: text("scope_key").notNull(),
    status: analyticsMaterializationStatus("status")
      .default("pending")
      .notNull(),
    summary: jsonb("summary").$type<AnalyticsMaterializationJobSummary>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("analytics_scope_jobs_revision_scope_idx").on(
      table.analyticsRevision,
      table.scopeKey,
      table.status,
    ),
    index("analytics_scope_jobs_created_at_idx").on(table.createdAt),
  ],
);

export const analyticsEffectiveVotes = pgTable(
  "analytics_effective_votes",
  {
    submissionId: uuid("submission_id").notNull(),
    leagueId: uuid("league_id").notNull(),
    roundId: uuid("round_id").notNull(),
    submitterId: uuid("submitter_id").notNull(),
    voterId: uuid("voter_id").notNull(),
    points: integer("points").notNull(),
    explicit: boolean("explicit").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_effective_votes_pk",
      columns: [table.roundId, table.submissionId, table.voterId],
    }),
    index("analytics_effective_votes_league_idx").on(table.leagueId),
    index("analytics_effective_votes_round_idx").on(table.roundId),
    index("analytics_effective_votes_submitter_idx").on(table.submitterId),
    index("analytics_effective_votes_voter_idx").on(table.voterId),
  ],
);

export const analyticsSongStats = pgTable(
  "analytics_song_stats",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album"),
    spotifyUri: text("spotify_uri").notNull(),
    submitterId: uuid("submitter_id").notNull(),
    submitterName: text("submitter_name").notNull(),
    leagueId: uuid("league_id").notNull(),
    leagueName: text("league_name").notNull(),
    leagueSlug: text("league_slug").notNull(),
    leagueMusicLeagueId: text("league_music_league_id"),
    roundId: uuid("round_id").notNull(),
    sourceRoundId: text("source_round_id").notNull(),
    roundName: text("round_name").notNull(),
    roundOrdinal: integer("round_ordinal").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    points: integer("points").notNull(),
    expectedPoints: doublePrecision("expected_points").notNull(),
    eligibleRows: integer("eligible_rows").notNull(),
    positiveRows: integer("positive_rows").notNull(),
    pointsPerEligibleVoter: doublePrecision("points_per_eligible_voter"),
    positiveReach: doublePrecision("positive_reach"),
    roundPointShare: doublePrecision("round_point_share"),
    supportIndex: doublePrecision("support_index"),
    supportIndexEb: doublePrecision("support_index_eb"),
    supportZ: doublePrecision("support_z"),
    performancePercentile: doublePrecision("performance_percentile"),
    ...timestamps,
  },
  (table) => [
    index("analytics_song_submitter_idx").on(table.submitterId),
    index("analytics_song_points_idx").on(table.points),
    index("analytics_song_support_idx").on(table.supportIndex),
    index("analytics_song_support_eb_idx").on(table.supportIndexEb),
    index("analytics_song_support_z_idx").on(table.supportZ),
    index("analytics_song_scope_idx").on(table.leagueId, table.roundId),
  ],
);

export const analyticsPlayerStats = pgTable(
  "analytics_player_stats",
  {
    scopeKey: text("scope_key").notNull(),
    id: uuid("id").notNull(),
    name: text("name").notNull(),
    totalPoints: integer("total_points").notNull(),
    submissions: integer("submissions").notNull(),
    enteredRounds: integer("entered_rounds").notNull(),
    pointsPerSubmission: doublePrecision("points_per_submission"),
    pointsPerEligibleVoter: doublePrecision("points_per_eligible_voter"),
    averageRoundIndex: doublePrecision("average_round_index"),
    averageRoundPercentile: doublePrecision("average_round_percentile"),
    roundWins: integer("round_wins").notNull(),
    topQuartileRate: doublePrecision("top_quartile_rate"),
    performanceRank: integer("performance_rank"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_player_stats_pk",
      columns: [table.scopeKey, table.id],
    }),
    index("analytics_player_points_idx").on(table.scopeKey, table.totalPoints),
    index("analytics_player_name_idx").on(table.scopeKey, table.name),
  ],
);

export const analyticsPointDistribution = pgTable(
  "analytics_point_distribution",
  {
    scopeKey: text("scope_key").notNull(),
    points: integer("points").notNull(),
    count: integer("count").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_point_distribution_pk",
      columns: [table.scopeKey, table.points],
    }),
  ],
);

export const analyticsPlayerPointDistribution = pgTable(
  "analytics_player_point_distribution",
  {
    scopeKey: text("scope_key").notNull(),
    playerId: uuid("player_id").notNull(),
    direction: text("direction").notNull(),
    points: integer("points").notNull(),
    count: integer("count").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_player_point_distribution_pk",
      columns: [table.scopeKey, table.playerId, table.direction, table.points],
    }),
    index("analytics_player_point_player_idx").on(
      table.scopeKey,
      table.playerId,
    ),
  ],
);

export const analyticsRelationshipPairs = pgTable(
  "analytics_relationship_pairs",
  {
    scopeKey: text("scope_key").notNull(),
    direction: text("direction").notNull(),
    leftId: uuid("left_id").notNull(),
    leftName: text("left_name").notNull(),
    rightId: uuid("right_id").notNull(),
    rightName: text("right_name").notNull(),
    points: integer("points").notNull(),
    opportunities: integer("opportunities").notNull(),
    sharedRounds: integer("shared_rounds").notNull(),
    scopeRounds: integer("scope_rounds").notNull(),
    pointsPerOpportunity: doublePrecision("points_per_opportunity").notNull(),
    positiveRate: doublePrecision("positive_rate").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_relationship_pairs_pk",
      columns: [table.scopeKey, table.direction, table.leftId, table.rightId],
    }),
    index("analytics_relationship_pairs_left_idx").on(
      table.scopeKey,
      table.leftId,
    ),
    index("analytics_relationship_pairs_right_idx").on(
      table.scopeKey,
      table.rightId,
    ),
  ],
);

export const analyticsRelationshipMutual = pgTable(
  "analytics_relationship_mutual",
  {
    scopeKey: text("scope_key").notNull(),
    leftId: uuid("left_id").notNull(),
    leftName: text("left_name").notNull(),
    rightId: uuid("right_id").notNull(),
    rightName: text("right_name").notNull(),
    points: integer("points").notNull(),
    opportunities: integer("opportunities").notNull(),
    sharedRounds: integer("shared_rounds").notNull(),
    scopeRounds: integer("scope_rounds").notNull(),
    pointsPerOpportunity: doublePrecision("points_per_opportunity").notNull(),
    positiveRate: doublePrecision("positive_rate").notNull(),
    ballotPointShare: doublePrecision("ballot_point_share").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_relationship_mutual_pk",
      columns: [table.scopeKey, table.leftId, table.rightId],
    }),
    index("analytics_relationship_mutual_left_idx").on(
      table.scopeKey,
      table.leftId,
    ),
    index("analytics_relationship_mutual_right_idx").on(
      table.scopeKey,
      table.rightId,
    ),
  ],
);

export const analyticsRelationshipAlignment = pgTable(
  "analytics_relationship_alignment",
  {
    scopeKey: text("scope_key").notNull(),
    leftId: uuid("left_id").notNull(),
    leftName: text("left_name").notNull(),
    rightId: uuid("right_id").notNull(),
    rightName: text("right_name").notNull(),
    alignment: doublePrecision("alignment").notNull(),
    comparableFeatures: integer("comparable_features").notNull(),
    sharedRounds: integer("shared_rounds").notNull(),
    scopeRounds: integer("scope_rounds").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_relationship_alignment_pk",
      columns: [table.scopeKey, table.leftId, table.rightId],
    }),
    index("analytics_relationship_alignment_score_idx").on(
      table.scopeKey,
      table.alignment,
    ),
    index("analytics_relationship_alignment_left_idx").on(
      table.scopeKey,
      table.leftId,
    ),
    index("analytics_relationship_alignment_right_idx").on(
      table.scopeKey,
      table.rightId,
    ),
  ],
);

export const analyticsPlayerTiming = pgTable(
  "analytics_player_timing",
  {
    playerId: uuid("player_id").notNull(),
    playerName: text("player_name").notNull(),
    roundId: uuid("round_id").notNull(),
    roundName: text("round_name").notNull(),
    leagueId: uuid("league_id").notNull(),
    leagueName: text("league_name").notNull(),
    leagueSlug: text("league_slug").notNull(),
    leagueMusicLeagueId: text("league_music_league_id"),
    sourceRoundId: text("source_round_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    castAt: timestamp("cast_at", { withTimezone: true }),
    relativeOrder: doublePrecision("relative_order"),
    ballotRank: integer("ballot_rank"),
    tieCount: integer("tie_count"),
    observedVoters: integer("observed_voters").notNull(),
    participation: text("participation").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "analytics_player_timing_pk",
      columns: [table.playerId, table.roundId],
    }),
    index("analytics_player_timing_player_idx").on(table.playerId),
    index("analytics_player_timing_league_idx").on(table.leagueId),
    index("analytics_player_timing_relative_idx").on(table.relativeOrder),
  ],
);

export type SpotifyEnrichmentProgress = {
  kind: "progress";
  message: string;
  processed: number;
  total: number;
  ok: number;
  notFound: number;
  error: number;
  waitingMs?: number;
};

export type SpotifyEnrichmentCompletedSummary = {
  kind: "completed";
  processed: number;
  ok: number;
  notFound: number;
  error: number;
  ambiguousOnly: boolean;
};

export type SpotifyEnrichmentJobSummary =
  | SpotifyEnrichmentProgress
  | SpotifyEnrichmentCompletedSummary;

export const spotifyTrackEnrichments = pgTable(
  "spotify_track_enrichments",
  {
    spotifyTrackId: text("spotify_track_id").primaryKey(),
    status: spotifyEnrichmentStatus("status").default("pending").notNull(),
    errorMessage: text("error_message"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("spotify_track_enrichments_status_idx").on(table.status)],
);

export const spotifyTrackArtists = pgTable(
  "spotify_track_artists",
  {
    spotifyTrackId: text("spotify_track_id")
      .notNull()
      .references(() => spotifyTrackEnrichments.spotifyTrackId, {
        onDelete: "cascade",
      }),
    position: integer("position").notNull(),
    artistSpotifyId: text("artist_spotify_id").notNull(),
    artistName: text("artist_name").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "spotify_track_artists_pk",
      columns: [table.spotifyTrackId, table.position],
    }),
    index("spotify_track_artists_artist_id_idx").on(table.artistSpotifyId),
    index("spotify_track_artists_artist_name_idx").on(table.artistName),
    check("spotify_track_artists_position_nonneg", sql`${table.position} >= 0`),
  ],
);

export const spotifyEnrichmentJobs = pgTable(
  "spotify_enrichment_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ambiguousOnly: boolean("ambiguous_only").notNull(),
    status: analyticsMaterializationStatus("status")
      .default("pending")
      .notNull(),
    summary: jsonb("summary").$type<SpotifyEnrichmentJobSummary>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("spotify_enrichment_jobs_status_idx").on(table.status),
    index("spotify_enrichment_jobs_created_at_idx").on(table.createdAt),
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
export type AnalyticsMaterializationJob =
  typeof analyticsMaterializationJobs.$inferSelect;
export type AnalyticsScopeJob = typeof analyticsScopeJobs.$inferSelect;
export type SpotifyTrackEnrichment =
  typeof spotifyTrackEnrichments.$inferSelect;
export type SpotifyTrackArtist = typeof spotifyTrackArtists.$inferSelect;
export type SpotifyEnrichmentJob = typeof spotifyEnrichmentJobs.$inferSelect;
