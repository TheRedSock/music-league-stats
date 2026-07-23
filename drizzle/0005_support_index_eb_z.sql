ALTER TABLE "analytics_song_stats" ADD COLUMN "support_index_eb" double precision;--> statement-breakpoint
ALTER TABLE "analytics_song_stats" ADD COLUMN "support_z" double precision;--> statement-breakpoint
CREATE INDEX "analytics_song_support_eb_idx" ON "analytics_song_stats" USING btree ("support_index_eb");--> statement-breakpoint
CREATE INDEX "analytics_song_support_z_idx" ON "analytics_song_stats" USING btree ("support_z");
