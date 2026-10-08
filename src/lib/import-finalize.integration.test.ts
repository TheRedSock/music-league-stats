import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { finalizeImportAnalytics, importNeedsAnalyticsRefresh } from "@/lib/import-finalize";
import { commitImportBatch } from "@/lib/import-commit";
import { ANALYTICS_REVISION } from "@/lib/analytics-revision";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
const url = process.env.ANALYTICS_TEST_DATABASE_URL;

describe.skipIf(!url)("import finalization recovery", () => {
  it("rolls invalidation back with its receipt, then safely retries an already committed batch", async () => {
    const client = postgres(url!, { max: 1, onnotice: () => {} });
    const rollback = new Error("rollback fixtures");
    try {
      await drizzle(client, { schema }).transaction(async tx => {
        await tx.execute(sql`set local search_path=pg_temp,public`);
        for (const table of ["import_batches", "analytics_materialization_jobs", "analytics_scope_jobs", "analytics_relationship_alignment", "analytics_relationship_mutual", "analytics_relationship_pairs", "analytics_player_stats", "analytics_point_distribution", "analytics_player_point_distribution"]) {
          await tx.execute(sql.raw(`create temp table ${table} (like public.${table} including all) on commit drop`));
        }
        const database = tx as unknown as Database;
        const [league] = await tx.select().from(schema.leagues).limit(1);
        const summary = { competitors: 2, memberships: 2, rounds: 1, submissions: 2, votes: 2 };
        const [batch] = await tx.insert(schema.importBatches).values({ leagueId: league.id, checksum: "a".repeat(64), manifest: {} as schema.ImportManifest, status: "completed", summary }).returning();
        expect(await commitImportBatch(batch.id, database)).toEqual(summary);
        await tx.execute(sql.raw(`create function pg_temp.fail_receipt() returns trigger language plpgsql as $$ begin raise exception 'receipt failure'; end $$`));
        await tx.execute(sql.raw(`create trigger fail_receipt before update on pg_temp.import_batches for each row execute function pg_temp.fail_receipt()`));
        await expect(finalizeImportAnalytics(batch.id, database)).rejects.toThrow();
        expect((await tx.select().from(schema.analyticsMaterializationJobs))).toHaveLength(0);
        expect((await tx.select().from(schema.importBatches))[0].summary).toEqual(summary);
        await tx.execute(sql.raw(`drop trigger fail_receipt on pg_temp.import_batches`));
        await finalizeImportAnalytics(batch.id, database);
        expect(await importNeedsAnalyticsRefresh(database)).toBe(true);
        expect((await tx.select().from(schema.importBatches))[0].summary?.analyticsInvalidatedAt).toBeTruthy();
        // A completed refresh must survive a repeated commit/finalization request.
        await tx.update(schema.analyticsMaterializationJobs).set({ status: "completed", analyticsRevision: ANALYTICS_REVISION });
        await commitImportBatch(batch.id, database);
        await finalizeImportAnalytics(batch.id, database);
        expect(await importNeedsAnalyticsRefresh(database)).toBe(false);
        expect((await tx.select().from(schema.analyticsMaterializationJobs))).toHaveLength(1);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { await client.end(); }
  });
});
