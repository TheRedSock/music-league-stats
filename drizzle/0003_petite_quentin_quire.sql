CREATE TYPE "public"."analytics_materialization_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "analytics_materialization_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analytics_revision" text NOT NULL,
	"status" "analytics_materialization_status" DEFAULT 'pending' NOT NULL,
	"summary" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_player_point_distribution" (
	"player_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"points" integer NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_player_point_distribution_pk" PRIMARY KEY("player_id","direction","points")
);
--> statement-breakpoint
CREATE TABLE "analytics_player_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"total_points" integer NOT NULL,
	"submissions" integer NOT NULL,
	"entered_rounds" integer NOT NULL,
	"points_per_submission" double precision,
	"points_per_eligible_voter" double precision,
	"average_round_index" double precision,
	"average_round_percentile" double precision,
	"round_wins" integer NOT NULL,
	"top_quartile_rate" double precision,
	"performance_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_player_timing" (
	"player_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"round_id" uuid NOT NULL,
	"round_name" text NOT NULL,
	"league_name" text NOT NULL,
	"league_slug" text NOT NULL,
	"league_music_league_id" text,
	"source_round_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"cast_at" timestamp with time zone,
	"relative_order" double precision,
	"ballot_rank" integer,
	"tie_count" integer,
	"observed_voters" integer NOT NULL,
	"participation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_player_timing_pk" PRIMARY KEY("player_id","round_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_point_distribution" (
	"points" integer PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_relationship_alignment" (
	"left_id" uuid NOT NULL,
	"left_name" text NOT NULL,
	"right_id" uuid NOT NULL,
	"right_name" text NOT NULL,
	"alignment" double precision NOT NULL,
	"comparable_features" integer NOT NULL,
	"shared_rounds" integer NOT NULL,
	"scope_rounds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_relationship_alignment_pk" PRIMARY KEY("left_id","right_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_relationship_mutual" (
	"left_id" uuid NOT NULL,
	"left_name" text NOT NULL,
	"right_id" uuid NOT NULL,
	"right_name" text NOT NULL,
	"points" integer NOT NULL,
	"opportunities" integer NOT NULL,
	"shared_rounds" integer NOT NULL,
	"scope_rounds" integer NOT NULL,
	"points_per_opportunity" double precision NOT NULL,
	"positive_rate" double precision NOT NULL,
	"ballot_point_share" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_relationship_mutual_pk" PRIMARY KEY("left_id","right_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_relationship_pairs" (
	"direction" text NOT NULL,
	"left_id" uuid NOT NULL,
	"left_name" text NOT NULL,
	"right_id" uuid NOT NULL,
	"right_name" text NOT NULL,
	"points" integer NOT NULL,
	"opportunities" integer NOT NULL,
	"shared_rounds" integer NOT NULL,
	"scope_rounds" integer NOT NULL,
	"points_per_opportunity" double precision NOT NULL,
	"positive_rate" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_relationship_pairs_pk" PRIMARY KEY("direction","left_id","right_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_song_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"spotify_uri" text NOT NULL,
	"submitter_id" uuid NOT NULL,
	"submitter_name" text NOT NULL,
	"league_id" uuid NOT NULL,
	"league_name" text NOT NULL,
	"league_slug" text NOT NULL,
	"league_music_league_id" text,
	"round_id" uuid NOT NULL,
	"source_round_id" text NOT NULL,
	"round_name" text NOT NULL,
	"round_ordinal" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"points" integer NOT NULL,
	"expected_points" double precision NOT NULL,
	"eligible_rows" integer NOT NULL,
	"positive_rows" integer NOT NULL,
	"points_per_eligible_voter" double precision,
	"positive_reach" double precision,
	"round_point_share" double precision,
	"support_index" double precision,
	"performance_percentile" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_jobs_revision_status_idx" ON "analytics_materialization_jobs" USING btree ("analytics_revision","status");--> statement-breakpoint
CREATE INDEX "analytics_jobs_created_at_idx" ON "analytics_materialization_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_player_point_player_idx" ON "analytics_player_point_distribution" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "analytics_player_points_idx" ON "analytics_player_stats" USING btree ("total_points");--> statement-breakpoint
CREATE INDEX "analytics_player_name_idx" ON "analytics_player_stats" USING btree ("name");--> statement-breakpoint
CREATE INDEX "analytics_player_timing_player_idx" ON "analytics_player_timing" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "analytics_player_timing_relative_idx" ON "analytics_player_timing" USING btree ("relative_order");--> statement-breakpoint
CREATE INDEX "analytics_relationship_alignment_score_idx" ON "analytics_relationship_alignment" USING btree ("alignment");--> statement-breakpoint
CREATE INDEX "analytics_relationship_alignment_left_idx" ON "analytics_relationship_alignment" USING btree ("left_id");--> statement-breakpoint
CREATE INDEX "analytics_relationship_alignment_right_idx" ON "analytics_relationship_alignment" USING btree ("right_id");--> statement-breakpoint
CREATE INDEX "analytics_relationship_mutual_left_idx" ON "analytics_relationship_mutual" USING btree ("left_id");--> statement-breakpoint
CREATE INDEX "analytics_relationship_mutual_right_idx" ON "analytics_relationship_mutual" USING btree ("right_id");--> statement-breakpoint
CREATE INDEX "analytics_relationship_pairs_left_idx" ON "analytics_relationship_pairs" USING btree ("left_id");--> statement-breakpoint
CREATE INDEX "analytics_relationship_pairs_right_idx" ON "analytics_relationship_pairs" USING btree ("right_id");--> statement-breakpoint
CREATE INDEX "analytics_song_submitter_idx" ON "analytics_song_stats" USING btree ("submitter_id");--> statement-breakpoint
CREATE INDEX "analytics_song_points_idx" ON "analytics_song_stats" USING btree ("points");--> statement-breakpoint
CREATE INDEX "analytics_song_support_idx" ON "analytics_song_stats" USING btree ("support_index");--> statement-breakpoint
CREATE INDEX "analytics_song_scope_idx" ON "analytics_song_stats" USING btree ("league_id","round_id");