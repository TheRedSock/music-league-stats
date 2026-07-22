ALTER TABLE "leagues" ADD COLUMN "music_league_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_music_league_id_unique" ON "leagues" USING btree ("music_league_id");