import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { alignmentComparisonTailCtes } from "@/lib/analytics";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { analyticsProgressKey } from "@/lib/analytics-job-progress";
import {
  startMaterializationJob, advanceMaterializationJob, invalidateAllLeaguesMaterialization,
  startScopeMaterializationJob, advanceScopeMaterializationJob,
} from "@/lib/analytics-materialize";

vi.mock("next/server", () => ({ after: vi.fn() }));
// Isolate test advisory locks as well as tables from real refresh workers.
vi.mock("drizzle-orm", async (original) => {
  const actual = await original<typeof import("drizzle-orm")>();
  const tag = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) =>
    actual.sql(strings, ...values.map((value) => value === 73_730_001 ? 73_730_099 : value)), actual.sql);
  return { ...actual, sql: tag };
});

const url = process.env.ANALYTICS_TEST_DATABASE_URL;
const inputs = ["leagues", "competitors", "league_members", "rounds", "submissions", "votes"];
const outputs = ["analytics_materialization_jobs", "analytics_scope_jobs", "analytics_effective_votes", "analytics_song_stats", "analytics_player_stats", "analytics_point_distribution", "analytics_player_point_distribution", "analytics_relationship_pairs", "analytics_relationship_mutual", "analytics_relationship_alignment", "analytics_player_timing"];

type AlignmentBallot = { round: string; voter: "a" | "b"; points: number[]; support?: number[] };

function alignmentFixture(ballots: AlignmentBallot[]) {
  const rounds = [...new Set(ballots.map(ballot => ballot.round))];
  const votes = ballots.flatMap(ballot => [
    ...ballot.points.map((points, i) => sql`(${ballot.round}, ${ballot.voter}, 'c', ${`c${i}`}, ${points}::int)`),
    ...(ballot.support ?? []).map((points, i) => {
      const other = ballot.voter === "a" ? "b" : "a";
      return sql`(${ballot.round}, ${ballot.voter}, ${other}, ${`${other}${i}`}, ${points}::int)`;
    }),
  ]);
  return new PgDialect().sqlToQuery(sql`
    with selected_rounds(id, league_id) as (values ${sql.join(rounds.map(round => sql`(${round}, 'league')`), sql`, `)}),
    league_members(league_id, competitor_id) as (values ('league', 'a'), ('league', 'b')),
    effective_votes(round_id, voter_id, submitter_id, submission_id, points) as (values ${sql.join(votes, sql`, `)}),
    ballot_totals as (select round_id, voter_id, sum(points)::double precision as ballot_points from effective_votes group by round_id, voter_id),
    ${alignmentComparisonTailCtes()}
    select * from pair_comparisons
  `);
}

describe.skipIf(!url)("analytics checkpoints (isolated PostgreSQL temporary tables)", () => {
  it("rolls back failed steps, resumes, rejects replays, and completes all league and combo checkpoints", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => undefined });
    const rolledBack = new Error("rollback test fixtures");
    try {
      await drizzle(client, { schema }).transaction(async (transaction) => {
        const connection = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => transaction.execute(sql(strings, ...values)), { unsafe: (text: string) => transaction.execute(sql.raw(text)) });
        await connection`set local search_path = pg_temp, public`;
        for (const table of [...inputs, ...outputs]) {
          await connection.unsafe(`create temp table "${table}" (like public."${table}" including all) on commit drop`);
          if (inputs.includes(table)) {
            await connection.unsafe(`insert into pg_temp."${table}" select * from public."${table}"`);
            await connection.unsafe(`analyze pg_temp."${table}"`);
          }
          const [resolved] = await connection`select n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=to_regclass(${table})`;
          expect(resolved.nspname).toMatch(/^pg_temp_/);
        }
        const database = transaction as unknown as Database;
        let state = await startMaterializationJob(database);
        const jobId = state.job!.id;
        const clearCursor = analyticsProgressKey(state.progress);
        state = await advanceMaterializationJob(jobId, database, clearCursor);
        expect(state.progress?.stepId).toBe("facts");
        expect((await advanceMaterializationJob(jobId, database, clearCursor)).progress?.stepId).toBe("facts");
        expect((await startMaterializationJob(database)).job?.id).toBe(jobId);

        // Fail exactly between calculated rows and their checkpoint update.
        await connection.unsafe(`create function pg_temp.fail_checkpoint() returns trigger language plpgsql as $$ begin if new.summary->>'stepIndex' = '2' then raise exception 'simulated timeout' using errcode = '57014'; end if; return new; end $$`);
        await connection.unsafe(`create trigger fail_checkpoint before update on pg_temp.analytics_materialization_jobs for each row execute function pg_temp.fail_checkpoint()`);
        const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
        state = await advanceMaterializationJob(jobId, database, analyticsProgressKey(state.progress));
        errorLog.mockRestore();
        expect(state.status).toBe("failed");
        expect(state.progress?.stepId).toBe("facts");
        expect(state.job?.errorMessage).toContain("processing time limit");
        expect(Number((await connection`select count(*) as n from analytics_effective_votes`)[0].n)).toBe(0);
        await connection.unsafe(`drop trigger fail_checkpoint on pg_temp.analytics_materialization_jobs`);
        state = await startMaterializationJob(database);
        expect(state.job?.id).toBe(jobId);
        state = await advanceMaterializationJob(jobId, database, analyticsProgressKey(state.progress));
        expect(state.progress?.stepId).toBe("songs");
        expect(Number((await connection`select count(*) as n from analytics_effective_votes`)[0].n)).toBeGreaterThan(0);

        let checkpoints = 2;
        let leagueCheckpoints = 0;
        while (state.status === "processing" && checkpoints++ < 100) {
          const previous = state.progress;
          if (previous?.stepId === "league-scopes") leagueCheckpoints++;
          state = await advanceMaterializationJob(jobId, database, analyticsProgressKey(previous));
          expect(state.job?.errorMessage).toBeNull();
          if (previous?.stepId === "league-scopes" && (previous.leagueStepIndex ?? 0) < 5) {
            expect(state.progress?.leagueIndex ?? 0).toBe(previous.leagueIndex ?? 0);
            expect(state.progress?.leagueStepIndex).toBe((previous.leagueStepIndex ?? 0) + 1);
          }
        }
        expect(state.status).toBe("completed");
        const leagueIds = (await connection`select id from leagues order by id`).map((row) => row.id as string);
        expect(leagueCheckpoints).toBe(leagueIds.length * 6);
        expect(Number((await connection`select count(*) as n from analytics_relationship_alignment where scope_key='all'`)[0].n)).toBeGreaterThan(0);
        const [alignmentRange] = await connection`select min(alignment) as minimum, max(alignment) as maximum from analytics_relationship_alignment`;
        expect(alignmentRange.minimum).toBeLessThan(0);
        expect(alignmentRange.minimum).toBeGreaterThanOrEqual(-1);
        expect(alignmentRange.maximum).toBeLessThanOrEqual(1);

        let combo = await startScopeMaterializationJob(leagueIds.slice(0, 2), database);
        for (let i = 0; combo.status === "processing" && i < 6; i++) combo = await advanceScopeMaterializationJob(combo.job!.id, database);
        expect(combo.status).toBe("completed");
        expect(combo.scopeKey).toContain(",");

        // Make timestamp order explicit inside this single outer transaction.
        await connection`update analytics_materialization_jobs set created_at='2000-01-01'`;
        await invalidateAllLeaguesMaterialization(database, "Test invalidation");
        expect((await advanceMaterializationJob(jobId, database)).status).toBe("pending");
        expect((await connection`select summary from analytics_scope_jobs where id=${combo.job!.id}`)[0].summary).toBeNull();
        throw rolledBack;
      });
    } catch (error) {
      if (error !== rolledBack) throw error;
    } finally {
      await client.end({ timeout: 3 });
    }
  }, 240_000);

  it("centers alignment with inferred zeroes, excludes reciprocal support and zero-budget ballots, and respects focus filtering", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async (connection) => {
        for (const focus of [undefined, "a", "c"]) {
          const query = new PgDialect().sqlToQuery(sql`
            with selected_rounds(id, league_id) as (values ('r1', 'league'), ('r2', 'league'), ('r3', 'league')),
            league_members(league_id, competitor_id) as (values ('league', 'a'), ('league', 'b'), ('league', 'c'), ('league', 'd')),
            effective_votes(round_id, voter_id, submitter_id, submission_id, points) as (values
              ('r1', 'a', 'b', 'b1', 4), ('r1', 'a', 'c', 'c1', 2), ('r1', 'a', 'd', 'd1', 0),
              ('r1', 'b', 'a', 'a1', 3), ('r1', 'b', 'a', 'a2', 1), ('r1', 'b', 'c', 'c1', 0), ('r1', 'b', 'd', 'd1', 2),
              ('r1', 'c', 'a', 'a1', 0), ('r1', 'c', 'a', 'a2', 0), ('r1', 'c', 'b', 'b1', 0), ('r1', 'c', 'd', 'd1', 0)
            ),
            ballot_totals as (select round_id, voter_id, sum(points)::double precision as ballot_points from effective_votes group by round_id, voter_id),
            ${alignmentComparisonTailCtes(focus)}
            select * from pair_comparisons
          `);
          const rows = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
          if (focus === "c") { expect(rows).toHaveLength(0); continue; }
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({ left_id: "a", right_id: "b", shared_rounds: 1, scope_rounds: 3, comparable_features: 2 });
          expect(rows[0].alignment).toBeCloseTo(-1, 12);
        }
      });
    } finally { await client.end({ timeout: 3 }); }
  });

  it.each([
    { name: "identical preferences despite different budgets and reciprocal support", a: [2, 2, 0, 0], b: [1, 1, 0, 0], expected: 1 },
    { name: "opposing preferences", a: [2, 2, 0, 0], b: [0, 0, 2, 2], expected: -1 },
    { name: "no linear agreement despite positive overlap", a: [2, 2, 0, 0], b: [2, 0, 2, 0], expected: 0 },
    { name: "higher-point favorites carry more information", a: [4, 1, 1, 0], b: [4, 1, 0, 1], expected: 8 / 9 },
  ])("calculates centered alignment for $name", async ({ a, b, expected }) => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async connection => {
        const query = alignmentFixture([
          { round: "r1", voter: "a", points: a, support: [5, 5] },
          { round: "r1", voter: "b", points: b, support: [1, 0] },
        ]);
        const rows = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ comparable_features: 4, shared_rounds: 1, scope_rounds: 1 });
        expect(rows[0].alignment).toBeCloseTo(expected, 12);
      });
    } finally { await client.end({ timeout: 3 }); }
  });

  it("excludes flat ballots from alignment features and coverage, including floating-point residuals", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async connection => {
        const ballots: AlignmentBallot[] = [
          { round: "flat", voter: "a", points: [1, 1, 1], support: [7] },
          { round: "flat", voter: "b", points: [2, 1, 0] },
          { round: "one-song", voter: "a", points: [2] },
          { round: "one-song", voter: "b", points: [1] },
          { round: "zero-budget", voter: "a", points: [0, 0, 0] },
          { round: "zero-budget", voter: "b", points: [2, 1, 0] },
        ];
        let query = alignmentFixture(ballots);
        expect(await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[])).toHaveLength(0);
        query = alignmentFixture([...ballots,
          { round: "informative", voter: "a", points: [2, 1, 0] },
          { round: "informative", voter: "b", points: [2, 1, 0] },
        ]);
        const rows = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ comparable_features: 3, shared_rounds: 1, scope_rounds: 4, alignment: 1 });
      });
    } finally { await client.end({ timeout: 3 }); }
  });

  it("centers alignment separately in each round before pooling budget-normalized deviations", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async connection => {
        const query = alignmentFixture([
          { round: "large-budget", voter: "a", points: [10, 0], support: [10] },
          { round: "large-budget", voter: "b", points: [0, 5], support: [5] },
          { round: "small-budget", voter: "a", points: [1, 0] },
          { round: "small-budget", voter: "b", points: [1, 0] },
        ]);
        const rows = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ comparable_features: 4, shared_rounds: 2, scope_rounds: 2 });
        // Round 1: deviations ±0.25, round 2: ±0.5. Raw-point pooling
        // would incorrectly let the large budget's disagreement dominate.
        expect(rows[0].alignment).toBeCloseTo(0.6, 12);
      });
    } finally { await client.end({ timeout: 3 }); }
  });
});
