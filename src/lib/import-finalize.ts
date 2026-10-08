import { eq, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { importBatches } from "@/db/schema";
import { invalidateScopesContainingLeague } from "@/lib/analytics-materialize";
import { ANALYTICS_REVISION } from "@/lib/analytics-revision";

/** Serialize retries, and commit the invalidation and its receipt together. */
export async function finalizeImportAnalytics(batchId: string, database: Database = db): Promise<void> {
  await database.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for("update");
    if (!batch?.summary || batch.status !== "completed") throw new Error("Import has not completed.");
    if (batch.summary.analyticsInvalidatedAt) return;
    await invalidateScopesContainingLeague(batch.leagueId, tx as unknown as Database, "Invalidated after import commit.");
    await tx.update(importBatches).set({
      summary: { ...batch.summary, analyticsInvalidatedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(importBatches.id, batchId));
  });
}

export async function importNeedsAnalyticsRefresh(database: Database = db): Promise<boolean> {
  const [latest] = await database.execute<{ status: string }>(sql`
    select status from analytics_materialization_jobs where analytics_revision = ${ANALYTICS_REVISION}
    order by created_at desc limit 1
  `);
  return latest?.status !== "completed";
}
