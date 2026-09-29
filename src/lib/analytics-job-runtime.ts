import type { Database } from "@/db";
import { sql, type Assume } from "drizzle-orm";
import type { Row, RowList } from "postgres";

export type AnalyticsExecutor = {
  execute<T extends Record<string, unknown> = Record<string, unknown>>(query: Parameters<Database["execute"]>[0]): PromiseLike<RowList<Assume<T, Row>[]>>;
};
type Executor = AnalyticsExecutor;

export function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? databaseErrorCode(error.cause) : undefined;
}

/** Leave time to roll back and return JSON before the 60-second host limit. */
export async function configureAnalyticsTransaction(tx: Executor): Promise<void> {
  await tx.execute(sql`set local statement_timeout = '35s'`);
  await tx.execute(sql`set local lock_timeout = '2s'`);
  await tx.execute(sql`set local idle_in_transaction_session_timeout = '15s'`);
}

export function budgetedAnalyticsExecutor(tx: Executor, startedAt: number): Executor {
  return {
    execute: async <T extends Record<string, unknown>>(query: Parameters<Database["execute"]>[0]) => {
      const remaining = Math.min(35_000, 40_000 - (Date.now() - startedAt));
      if (remaining <= 0) {
        throw Object.assign(new Error("Analytics step time budget exhausted."), { code: "57014" });
      }
      await tx.execute(sql`select set_config('statement_timeout', ${String(remaining)}, true)`);
      return tx.execute<T>(query);
    },
  };
}

export function analyticsFailureMessage(error: unknown, label: string): string {
  const code = databaseErrorCode(error);
  const reason = code === "57014"
    ? "exceeded its processing time limit"
    : code === "55P03" || code === "40P01"
      ? "could not acquire a database lock"
      : "could not be completed";
  return `${label} ${reason}. Completed steps are saved. Resume the refresh to retry this step.`;
}
