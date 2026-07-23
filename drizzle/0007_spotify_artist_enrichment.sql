CREATE TYPE "public"."spotify_enrichment_status" AS ENUM('pending', 'ok', 'not_found', 'error');--> statement-breakpoint
CREATE TABLE "spotify_track_enrichments" (
	"spotify_track_id" text PRIMARY KEY NOT NULL,
	"status" "spotify_enrichment_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_track_artists" (
	"spotify_track_id" text NOT NULL,
	"position" integer NOT NULL,
	"artist_spotify_id" text NOT NULL,
	"artist_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_track_artists_pk" PRIMARY KEY("spotify_track_id","position"),
	CONSTRAINT "spotify_track_artists_position_nonneg" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spotify_enrichment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ambiguous_only" boolean NOT NULL,
	"status" "analytics_materialization_status" DEFAULT 'pending' NOT NULL,
	"summary" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotify_track_artists" ADD CONSTRAINT "spotify_track_artists_spotify_track_id_spotify_track_enrichments_spotify_track_id_fk" FOREIGN KEY ("spotify_track_id") REFERENCES "public"."spotify_track_enrichments"("spotify_track_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotify_track_enrichments_status_idx" ON "spotify_track_enrichments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "spotify_track_artists_artist_id_idx" ON "spotify_track_artists" USING btree ("artist_spotify_id");--> statement-breakpoint
CREATE INDEX "spotify_track_artists_artist_name_idx" ON "spotify_track_artists" USING btree ("artist_name");--> statement-breakpoint
CREATE INDEX "spotify_enrichment_jobs_status_idx" ON "spotify_enrichment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "spotify_enrichment_jobs_created_at_idx" ON "spotify_enrichment_jobs" USING btree ("created_at");
