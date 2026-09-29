import { RequestError, requestJson } from "@/lib/request-json";
import { analyticsProgressKey } from "@/lib/analytics-job-progress";

export type AnalyticsRefreshProgress = {
  kind: "progress";
  stepId: string;
  stepLabel: string;
  stepIndex: number;
  stepCount: number;
  leagueIndex?: number;
  leagueCount?: number;
  leagueStepIndex?: number;
};

export type AnalyticsRefreshStatusResponse = {
  status: "missing" | "pending" | "processing" | "completed" | "failed";
  analyticsRevision: string;
  progress: AnalyticsRefreshProgress | null;
  job: {
    id: string;
    status: string;
    errorMessage?: string | null;
    updatedAt?: string | Date;
    summary?: Record<string, unknown> | null;
  } | null;
};

const endpoint = "/api/admin/analytics/refresh";
const pause = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));

export function readAnalyticsRefreshStatus(): Promise<AnalyticsRefreshStatusResponse> {
  return requestJson(endpoint, { cache: "no-store" }, "Checking analytics refresh progress");
}

export async function runSteppedAnalyticsRefresh(
  onProgress: (message: string, progress: AnalyticsRefreshProgress | null) => void,
): Promise<AnalyticsRefreshStatusResponse> {
  const post = (body: object, label: string) => requestJson<AnalyticsRefreshStatusResponse>(endpoint, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }, label);
  onProgress("Starting or resuming analytics refresh…", null);
  let status: AnalyticsRefreshStatusResponse | undefined;
  for (let attempt = 0; !status; attempt++) {
    try { status = await post({ action: "start" }, "Starting analytics refresh"); }
    catch (error) {
      if (!(error instanceof RequestError) || !error.retryable || attempt >= 2) throw error;
      onProgress("Connection interrupted; reconnecting to the saved refresh…", null);
      await pause(attempt);
    }
  }
  const jobId = status.job?.id;
  let stalledAttempts = 0;
  while (status.status === "processing" && status.job) {
    const progress = status.progress;
    const cursor = analyticsProgressKey(progress);
    const label = progress?.stepLabel ?? "Refreshing analytics";
    onProgress(`${label}…`, progress);
    let next: AnalyticsRefreshStatusResponse;
    try {
      next = await post({ action: "advance", jobId, cursor }, label);
    } catch (error) {
      if (!(error instanceof RequestError) || !error.retryable || stalledAttempts >= 3) {
        throw new Error(`${error instanceof Error ? error.message : label + " failed."} Progress is saved. Use Resume analytics refresh to continue.`);
      }
      onProgress(`${label}: reconnecting and checking saved progress…`, progress);
      await pause(stalledAttempts++);
      // An interrupted POST may have committed. Read before sending another.
      try { next = await readAnalyticsRefreshStatus(); }
      catch { continue; }
    }
    if (next.job?.id !== jobId) {
      throw new Error("Analytics were invalidated or another refresh replaced this job. Start the refresh again.");
    }
    if (next.status === "processing" && analyticsProgressKey(next.progress) === cursor) {
      if (++stalledAttempts > 4) {
        throw new Error(`${label} is still busy. Progress is saved. Use Resume analytics refresh to continue.`);
      }
      await pause(stalledAttempts - 1);
    } else {
      stalledAttempts = 0;
    }
    status = next;
  }
  if (status.status === "completed") {
    onProgress("All-leagues analytics refresh completed.", null);
    return status;
  }
  throw new Error(status.job?.errorMessage ?? "Analytics refresh did not complete. Use Resume analytics refresh to continue.");
}
