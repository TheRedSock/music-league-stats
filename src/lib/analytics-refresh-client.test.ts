import { afterEach, describe, expect, it, vi } from "vitest";
import { runSteppedAnalyticsRefresh } from "@/lib/analytics-refresh-client";

const progress = { kind: "progress", stepId: "league-scopes", stepIndex: 10, stepCount: 12, stepLabel: "League 3/9: alignment", leagueIndex: 2, leagueStepIndex: 5 };
const processing = { status: "processing", analyticsRevision: "test", progress, job: { id: "job", status: "processing" } };
const completed = { ...processing, status: "completed", progress: null, job: { id: "job", status: "completed" } };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("analytics refresh recovery", () => {
  it("checks saved status after a lost response without repeating a completed step", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(processing))
      .mockResolvedValueOnce(new Response("An error occurred", { status: 504 }))
      .mockResolvedValueOnce(Response.json(completed));
    vi.stubGlobal("fetch", fetch);
    const result = runSteppedAnalyticsRefresh(vi.fn());
    await vi.runAllTimersAsync();
    expect((await result).status).toBe("completed");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ action: "advance", jobId: "job", cursor: "10:2:5" });
    expect(fetch.mock.calls[2][1].method).toBeUndefined();
  });
  it("does not claim success when a newer job replaced the original", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(processing)).mockResolvedValueOnce(Response.json({ ...completed, job: { id: "replacement", status: "completed" } })));
    await expect(runSteppedAnalyticsRefresh(vi.fn())).rejects.toThrow("replaced this job");
  });
  it("reports the saved calculation failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(processing)).mockResolvedValueOnce(Response.json({ ...processing, status: "failed", job: { id: "job", errorMessage: "Alignment exceeded its time limit. Resume to retry." } })));
    await expect(runSteppedAnalyticsRefresh(vi.fn())).rejects.toThrow("Alignment exceeded its time limit");
  });
  it("bounds retries when the server keeps reporting the same busy checkpoint", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(processing))));
    const result = expect(runSteppedAnalyticsRefresh(vi.fn())).rejects.toThrow("still busy");
    await vi.runAllTimersAsync();
    await result;
  });
  it("stops immediately on an expired admin session", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "Your admin session has expired." }, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(runSteppedAnalyticsRefresh(vi.fn())).rejects.toThrow("session has expired");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
