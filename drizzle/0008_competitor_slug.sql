ALTER TABLE "competitors" ADD COLUMN "slug" text;--> statement-breakpoint
DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN
    SELECT "id", "name"
    FROM "competitors"
    ORDER BY "created_at" ASC, "id" ASC
  LOOP
    base := NULLIF(
      trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g')),
      ''
    );
    IF base IS NULL THEN
      base := 'player';
    END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM "competitors" c WHERE c."slug" = candidate
    ) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    UPDATE "competitors" SET "slug" = candidate WHERE "id" = r.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "competitors" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_slug_unique" ON "competitors" USING btree ("slug");
