// Read-only audit of the actual application query functions, without Next's cache.
// Run from the repository root: npx tsx docs/audit-2026-10-08/measure-analytics.ts
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import type { AnalyticsFilter } from "../../src/lib/analytics";

async function main() {
  config({ path: ".env", quiet: true });
  config({ path: ".env.local", override: true, quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(process.env.DATABASE_URL);
  process.env.DATABASE_URL = url.toString();
  const { getDb, closeDb } = await import("../../src/db/client");
  const a = await import("../../src/lib/analytics");
  const database = getDb();
  let statements: string[] = [];
  database.$client.options.debug = (_connection, query) => { statements.push(query); };
  try {
    await database.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await tx.execute(sql`set local statement_timeout = '15s'`);
    const safety = await tx.execute(sql`show transaction_read_only`);
    if (safety[0]?.transaction_read_only !== "on") throw new Error("Read-only guard failed");
    // Keep every application read on the guarded transaction connection.
    const originalExecute = database.execute;
    const originalSelect = database.select;
    database.execute = tx.execute.bind(tx);
    database.select = tx.select.bind(tx);
    try {
    const filters = await a.getFilterOptions();
    const player = await a.resolveCompetitorRef("theredsock");
    if (!player) throw new Error("Audit player missing");
    const results: object[] = [];
    const scopes: Array<[string, AnalyticsFilter]> = [
      ["all", { leagueIds: [], roundIds: [] }],
      ["latest", { leagueIds: [filters.defaultLeagueId!], roundIds: [] }],
    ];
    for (const [label, filter] of scopes) {
      const cases: [string, () => Promise<unknown>][] = [
        ["status", () => a.loadAnalytics(async () => true)],
        ["dashboard", () => a.getDashboardData(filter)],
        ["songs", () => a.getSongsData(filter, { page: 1, pageSize: 25, search: "", sort: "points", direction: "desc" })],
        ["players", () => a.getPlayersData(filter, { search: "", sort: "points", direction: "desc" })],
        ["profile", () => a.getPlayerProfileData(player.id, filter)],
        ["facts", () => a.getSubmissionFactsData(filter)],
        ["alignment", () => a.getRelationshipsTableData(filter, { direction: "desc", focusPlayerId: null, sort: "alignment", tab: "alignment" })],
      ];
      for (const [name, run] of cases) {
        const samples = [];
        for (let i = 0; i < 3; i++) {
          statements = [];
          const start = performance.now();
          const data = await run();
          samples.push({ ms: Math.round(performance.now() - start), queries: statements.length, statusQueries: statements.filter(q => q.includes("analytics_materialization_jobs")).length, jsonBytes: Buffer.byteLength(JSON.stringify(data)) });
        }
        const result = { scope: label, name, samples };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }
    const jobs = await database.execute(sql`select status, started_at, completed_at, summary from analytics_materialization_jobs order by created_at desc limit 5`);
    const counts = await database.execute(sql`select (select count(*) from votes)::int as votes, (select count(*) from import_staging_rows)::int as staging_rows, (select count(*) from import_batches)::int as import_batches, (select count(*) from analytics_effective_votes)::int as effective_votes`);
    const report = { measuredAt: new Date().toISOString(), readOnly: true, note: "Three sequential samples per uncached application query function within one read-only transaction. Network latency included; queries share one connection and React request memoization is inactive. This is not deployed page latency.", results, counts, jobs };
    await writeFile("docs/audit-2026-10-08/query-measurements.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ counts, jobs }));
    } finally { database.execute = originalExecute; database.select = originalSelect; }
    });
  } finally { await closeDb(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; });
