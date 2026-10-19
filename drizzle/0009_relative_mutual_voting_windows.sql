ALTER TABLE "analytics_relationship_mutual" ADD COLUMN "expected_points" double precision;
--> statement-breakpoint
ALTER TABLE "analytics_relationship_mutual" ADD COLUMN "relative_support" double precision;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "voting_opens_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "voting_closes_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_voting_window_valid" CHECK (
  ("voting_opens_at" IS NULL AND "voting_closes_at" IS NULL)
  OR ("voting_opens_at" IS NOT NULL AND "voting_closes_at" IS NOT NULL AND "voting_closes_at" > "voting_opens_at")
);
--> statement-breakpoint
ALTER TABLE "analytics_player_timing" ADD COLUMN "window_position" double precision;
--> statement-breakpoint
ALTER TABLE "analytics_player_timing" ADD COLUMN "window_opens_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "analytics_player_timing" ADD COLUMN "window_closes_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "analytics_player_timing" ADD COLUMN "window_source" text DEFAULT 'unavailable' NOT NULL;
