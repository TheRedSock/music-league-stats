CREATE TYPE "public"."import_kind" AS ENUM('competitors', 'rounds', 'submissions', 'votes');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."league_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_competitor_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"manifest" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"summary" jsonb,
	"error_message" text,
	"received_rows" integer DEFAULT 0 NOT NULL,
	"received_chunks" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_received_rows_nonnegative" CHECK ("import_batches"."received_rows" >= 0),
	CONSTRAINT "import_batches_received_chunks_nonnegative" CHECK ("import_batches"."received_chunks" >= 0),
	CONSTRAINT "import_batches_timestamps_ordered" CHECK ("import_batches"."completed_at" is null or "import_batches"."started_at" is null or "import_batches"."completed_at" >= "import_batches"."started_at")
);
--> statement-breakpoint
CREATE TABLE "import_chunks" (
	"batch_id" uuid NOT NULL,
	"kind" "import_kind" NOT NULL,
	"chunk_index" integer NOT NULL,
	"start_row" integer NOT NULL,
	"row_count" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_chunks_pk" PRIMARY KEY("batch_id","kind","chunk_index"),
	CONSTRAINT "import_chunks_index_nonnegative" CHECK ("import_chunks"."chunk_index" >= 0),
	CONSTRAINT "import_chunks_start_row_nonnegative" CHECK ("import_chunks"."start_row" >= 0),
	CONSTRAINT "import_chunks_row_count_positive" CHECK ("import_chunks"."row_count" > 0),
	CONSTRAINT "import_chunks_byte_size_positive" CHECK ("import_chunks"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_staging_rows" (
	"batch_id" uuid NOT NULL,
	"kind" "import_kind" NOT NULL,
	"row_index" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"source_row" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_staging_rows_pk" PRIMARY KEY("batch_id","kind","row_index"),
	CONSTRAINT "import_staging_rows_index_nonnegative" CHECK ("import_staging_rows"."row_index" >= 0),
	CONSTRAINT "import_staging_rows_chunk_index_nonnegative" CHECK ("import_staging_rows"."chunk_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"display_name" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_members_pk" PRIMARY KEY("league_id","competitor_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_league_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"total_rounds" integer NOT NULL,
	"max_players" integer NOT NULL,
	"songs_per_player_per_round" integer NOT NULL,
	"status" "league_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_total_rounds_positive" CHECK ("leagues"."total_rounds" > 0),
	CONSTRAINT "leagues_max_players_positive" CHECK ("leagues"."max_players" > 0),
	CONSTRAINT "leagues_songs_per_player_positive" CHECK ("leagues"."songs_per_player_per_round" > 0),
	CONSTRAINT "leagues_dates_ordered" CHECK ("leagues"."end_date" is null or "leagues"."start_date" is null or "leagues"."end_date" >= "leagues"."start_date")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"source_round_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"playlist_url" text,
	"source_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_id_league_unique" UNIQUE("id","league_id"),
	CONSTRAINT "rounds_ordinal_positive" CHECK ("rounds"."ordinal" > 0)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"source_submission_id" text NOT NULL,
	"submitter_id" uuid NOT NULL,
	"spotify_uri" text NOT NULL,
	"song_title" text NOT NULL,
	"artist_name" text NOT NULL,
	"album_name" text,
	"comment" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"visible_to_voters" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_id_round_unique" UNIQUE("id","round_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"comment" text,
	"cast_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_points_nonnegative" CHECK ("votes"."points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_chunks" ADD CONSTRAINT "import_chunks_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_staging_rows" ADD CONSTRAINT "import_staging_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_league_fk" FOREIGN KEY ("round_id","league_id") REFERENCES "public"."rounds"("id","league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitter_membership_fk" FOREIGN KEY ("league_id","submitter_id") REFERENCES "public"."league_members"("league_id","competitor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_round_league_fk" FOREIGN KEY ("round_id","league_id") REFERENCES "public"."rounds"("id","league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_submission_round_fk" FOREIGN KEY ("submission_id","round_id") REFERENCES "public"."submissions"("id","round_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_membership_fk" FOREIGN KEY ("league_id","voter_id") REFERENCES "public"."league_members"("league_id","competitor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_source_id_unique" ON "competitors" USING btree ("source_competitor_id");--> statement-breakpoint
CREATE INDEX "competitors_name_idx" ON "competitors" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_league_checksum_unique" ON "import_batches" USING btree ("league_id","checksum");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_created_at_idx" ON "import_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_chunks_batch_idx" ON "import_chunks" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_staging_rows_batch_kind_idx" ON "import_staging_rows" USING btree ("batch_id","kind");--> statement-breakpoint
CREATE INDEX "league_members_competitor_idx" ON "league_members" USING btree ("competitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_source_id_unique" ON "leagues" USING btree ("source_league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_unique" ON "leagues" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "leagues_status_idx" ON "leagues" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_league_source_id_unique" ON "rounds" USING btree ("league_id","source_round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_league_ordinal_unique" ON "rounds" USING btree ("league_id","ordinal");--> statement-breakpoint
CREATE INDEX "rounds_league_idx" ON "rounds" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_round_source_id_unique" ON "submissions" USING btree ("round_id","source_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_round_spotify_uri_unique" ON "submissions" USING btree ("round_id","spotify_uri");--> statement-breakpoint
CREATE INDEX "submissions_round_idx" ON "submissions" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "submissions_submitter_idx" ON "submissions" USING btree ("league_id","submitter_id");--> statement-breakpoint
CREATE INDEX "submissions_spotify_uri_idx" ON "submissions" USING btree ("spotify_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_round_submission_voter_unique" ON "votes" USING btree ("round_id","submission_id","voter_id");--> statement-breakpoint
CREATE INDEX "votes_submission_idx" ON "votes" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "votes_voter_idx" ON "votes" USING btree ("league_id","voter_id");