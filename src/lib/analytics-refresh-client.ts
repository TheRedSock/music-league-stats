export type AnalyticsRefreshProgress = {
  kind: "progress";
  stepId: string;
  stepLabel: string;
  stepIndex: number;
  stepCount: number;
};

export type AnalyticsRefreshStatusResponse = {
  status: "missing" | "pending" | "processing" | "completed" | "failed";
  analyticsRevision: string;
  progress: AnalyticsRefreshProgress | null;
  job: {
    id: string;
    status: string;
    errorMessage?: string | null;
    summary?: Record<string, unknown> | null;
  } | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The analytics refresh request failed.");
  }
  return result;
}

export async function runSteppedAnalyticsRefresh(
  onProgress: (message: string, progress: AnalyticsRefreshProgress | null) => void,
): Promise<AnalyticsRefreshStatusResponse> {
  onProgress("Starting all-leagues analytics refresh…", null);
  let status = await responseJson<AnalyticsRefreshStatusResponse>(
    await fetch("/api/admin/analytics/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }),
  );

  while (status.status === "processing" && status.job) {
    const progress = status.progress;
    onProgress(
      progress
        ? `${progress.stepLabel} (${progress.stepIndex + 1}/${progress.stepCount})…`
        : "Refreshing all-leagues analytics…",
      progress,
    );
    status = await responseJson<AnalyticsRefreshStatusResponse>(
      await fetch("/api/admin/analytics/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance", jobId: status.job.id }),
      }),
    );
  }

  if (status.status === "failed") {
    throw new Error(
      status.job?.errorMessage ?? "All-leagues analytics refresh failed.",
    );
  }

  onProgress("All-leagues analytics refresh completed.", null);
  return status;
}
