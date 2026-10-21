import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { startScopeMaterializationJob } from "./analytics-materialize";

vi.mock("next/server", () => ({ after: vi.fn() }));
const leagueIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const checkpoint = { kind: "progress", stepId: "mutual", stepIndex: 2, stepCount: 5, stepLabel: "Mutual", steps: [{ step: "pairs", elapsedMs: 25 }] };
const budget = { recent: 0, active: 0, daily: 0, monthly: 0, failures: 0 };

function fixture(latest: Record<string, unknown> | null = null, limits = budget) {
  const queries: string[] = [];
  const insert = vi.fn((values) => ({ returning: async () => [{ ...values, id: "new-attempt" }] }));
  const tx = {
    execute: async (query: SQL) => {
      const text = new PgDialect().sqlToQuery(query).sql;
      queries.push(text);
      return text.includes("count(*) filter") ? [limits] : [];
    },
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => latest ? [latest] : [] }) }) }) }),
    insert: () => ({ values: insert }),
  };
  const database = { transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as Database;
  return { database, queries, insert };
}

describe("shared comparison admission", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it.each([
    { ...budget, recent: 8 }, { ...budget, active: 2 },
    { ...budget, daily: 24 }, { ...budget, monthly: 60 },
  ])("refuses new writes when a shared budget is exhausted: %j", async limits => {
    const f = fixture(null, limits);
    await expect(startScopeMaterializationJob(leagueIds, f.database)).rejects.toThrow();
    expect(f.insert).not.toHaveBeenCalled();
    const lockIndex = f.queries.findIndex(query => query.includes("pg_advisory_xact_lock"));
    const budgetIndex = f.queries.findIndex(query => query.includes("count(*) filter"));
    expect(lockIndex).toBeGreaterThan(-1);
    expect(budgetIndex).toBeGreaterThan(lockIndex);
    expect(f.queries[budgetIndex]).not.toContain("analytics_revision");
  });

  it.each(["completed", "processing"])("reuses %s scopes without consuming admission capacity", async status => {
    const f = fixture({ id: "existing", status, summary: checkpoint }, { ...budget, monthly: 60 });
    expect((await startScopeMaterializationJob(leagueIds, f.database)).job?.id).toBe("existing");
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.queries.some(query => query.includes("count(*) filter"))).toBe(false);
  });

  it("charges retries as new attempts while retaining completed checkpoints", async () => {
    const f = fixture({ id: "failed", status: "failed", summary: checkpoint, updatedAt: new Date(Date.now() - 61_000), createdAt: new Date(0) }, { ...budget, failures: 1 });
    const result = await startScopeMaterializationJob(leagueIds, f.database);
    expect(result.job?.id).toBe("new-attempt");
    expect(result.job?.summary).toEqual(checkpoint);
    expect(f.insert).toHaveBeenCalledOnce();
  });

  it("does not let a failed job bypass exhausted admission or retry cooldowns", async () => {
    const failed = { id: "failed", status: "failed", summary: checkpoint, updatedAt: new Date(), createdAt: new Date(0) };
    for (const limits of [{ ...budget, monthly: 60 }, { ...budget, failures: 1 }, { ...budget, failures: 3 }]) {
      const f = fixture(failed, limits);
      await expect(startScopeMaterializationJob(leagueIds, f.database)).rejects.toThrow();
      expect(f.insert).not.toHaveBeenCalled();
    }
  });
});
