import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { startMaterializationJob, advanceMaterializationJob, startScopeMaterializationJob, advanceScopeMaterializationJob } from "@/lib/analytics-materialize";
import { analyticsProgressKey } from "@/lib/analytics-job-progress";

const variant = vi.hoisted(() => ({ source: "live" as "live" | "materialized", allowStored: false }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/analytics", async original => {
  const actual = await original<typeof import("@/lib/analytics")>();
  const storedVotes = (filter: Parameters<typeof actual.voteOpportunityCtes>[0]) => sql`
    selected_rounds as (select r.* from rounds r where ${filter.leagueIds.length ? sql`r.league_id in (${sql.join(filter.leagueIds.map(id=>sql`${id}`),sql`, `)})` : sql`true`}),
    scope_thresholds as (select count(*)::int as scope_rounds from selected_rounds),
    effective_votes as (select ev.* from analytics_effective_votes ev join selected_rounds sr on sr.id=ev.round_id),
    ballot_totals as (select round_id,voter_id,sum(points)::float8 as ballot_points,count(*)::int as eligible_opportunities from effective_votes group by round_id,voter_id)
  `;
  const reuse = () => variant.source === "materialized" && variant.allowStored;
  return { ...actual,
    voteOpportunityCtes: (filter: Parameters<typeof actual.voteOpportunityCtes>[0]) => reuse() ? storedVotes(filter) : actual.voteOpportunityCtes(filter),
    songStatsCtes: (filter: Parameters<typeof actual.songStatsCtes>[0]) => actual.songStatsCtes(filter),
    alignmentComparisonCtes: (filter: Parameters<typeof actual.alignmentComparisonCtes>[0], player?: string) => reuse() ? sql`${storedVotes(filter)}, ${actual.alignmentComparisonTailCtes(player)}` : actual.alignmentComparisonCtes(filter, player),
  };
});
const url = process.env.ANALYTICS_TEST_DATABASE_URL;
const inputs = ["leagues", "competitors", "league_members", "rounds", "submissions", "votes"];
const outputs = ["analytics_effective_votes", "analytics_song_stats", "analytics_player_stats", "analytics_point_distribution", "analytics_player_point_distribution", "analytics_relationship_pairs", "analytics_relationship_mutual", "analytics_relationship_alignment", "analytics_player_timing"];

// The reuse candidate stays in this experiment: measured savings did not justify changing production calculations.
describe.skipIf(!url)("refresh reuse experiment", () => {
  it("matches every stored result and combination scope while recording checkpoint costs", async () => {
    const client = postgres(url!, { max: 1, onnotice: () => {} });
    const rollback = new Error("rollback fixtures");
    const results: { source: string; elapsedMs: number; steps: schema.AnalyticsStepTiming[]; counts: Record<string, number> }[] = [];
    let baseline: Record<string, unknown[]> | undefined;
    try {
      for (const source of ["live", "materialized"] as const) {
        variant.source = source;
        try {
          await drizzle(client, { schema }).transaction(async tx => {
            await tx.execute(sql`set local search_path=pg_temp,public`);
            for (const table of [...inputs, ...outputs, "analytics_materialization_jobs", "analytics_scope_jobs"]) {
              await tx.execute(sql.raw(`create temp table ${table} (like public.${table} including all) on commit drop`));
              if (inputs.includes(table)) await tx.execute(sql.raw(`insert into pg_temp.${table} select * from public.${table}`));
              await tx.execute(sql.raw(`analyze pg_temp.${table}`));
            }
            const database = tx as unknown as Database;
            const start = Date.now();
            let state = await startMaterializationJob(database);
            let advances = 0;
            while (state.status === "processing" && advances++ < 300) {
              variant.allowStored = !["facts", "player-timing"].includes(state.progress!.stepId);
              state = await advanceMaterializationJob(state.job!.id, database, analyticsProgressKey(state.progress));
            }
            expect(state.job?.errorMessage).toBeNull();
            expect(state.status).toBe("completed");
            const steps = state.job!.summary!.steps!;
            expect(steps.length).toBeGreaterThan(12);
            expect(steps.every(step => step.elapsedMs >= 0)).toBe(true);
            const leagues = await tx.select({ id: schema.leagues.id }).from(schema.leagues);
            variant.allowStored = true;
            let combo = await startScopeMaterializationJob(leagues.slice(0,2).map(row => row.id), database);
            for (let i=0; combo.status === "processing" && i<6; i++) combo = await advanceScopeMaterializationJob(combo.job!.id, database);
            expect(combo.status).toBe("completed");
            expect(combo.scopeKey).toContain(",");
            expect(combo.job!.summary!.steps).toHaveLength(5);
            const values: Record<string, unknown[]> = {};
            for (const table of outputs) {
              const records = await tx.execute(sql.raw(`select to_jsonb(t)-'created_at'-'updated_at' as value from ${table} t`));
              // Floating sums can change their last bits with a different plan.
              // Compare every field, quantizing only finite float values to 10 significant digits.
              values[table] = records.map(row => JSON.parse(JSON.stringify(row.value, (_key,value) => typeof value === "number" && !Number.isInteger(value) ? (Math.abs(value) < 1e-10 ? 0 : Number(value.toPrecision(10))) : value))).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
            }
            if (baseline) expect(values).toEqual(baseline); else baseline = values;
            results.push({ source, elapsedMs: Date.now()-start, steps, counts: Object.fromEntries(Object.entries(values).map(([key,rows]) => [key,rows.length])) });
            throw rollback;
          });
        } catch (error) { if (error !== rollback) throw error; }
      }
      if (process.env.REFRESH_BENCH_OUTPUT) await writeFile(process.env.REFRESH_BENCH_OUTPUT, JSON.stringify({ measuredAt: new Date().toISOString(), note: "Isolated local PostgreSQL; actual application refresh steps, excluding HTTP pacing and remote DB latency. All tables compared, floating values to 10 significant digits.", results }, null, 2));
    } finally { await client.end(); }
  }, 240000);
});
