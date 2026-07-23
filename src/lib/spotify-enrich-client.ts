export type SpotifyEnrichProgress = {
  kind: "progress";
  message: string;
  processed: number;
  total: number;
  ok: number;
  notFound: number;
  error: number;
  waitingMs?: number;
};

export type SpotifyEnrichCounts = {
  enrichedOk: number;
  pending: number;
  notFound: number;
  error: number;
  ambiguousPending: number;
  allPending: number;
};

export type SpotifyEnrichStatusResponse = {
  status: "missing" | "pending" | "processing" | "completed" | "failed";
  counts: SpotifyEnrichCounts;
  progress: SpotifyEnrichProgress | null;
  job: {
    id: string;
    status: string;
    ambiguousOnly?: boolean;
    errorMessage?: string | null;
    summary?: Record<string, unknown> | null;
  } | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The Spotify enrich request failed.");
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSteppedSpotifyEnrich(
  ambiguousOnly: boolean,
  onProgress: (
    message: string,
    progress: SpotifyEnrichProgress | null,
    status?: SpotifyEnrichStatusResponse,
  ) => void,
): Promise<SpotifyEnrichStatusResponse> {
  onProgress(
    ambiguousOnly
      ? "Starting ambiguous-collab Spotify enrich…"
      : "Starting full Spotify enrich…",
    null,
  );
  let status = await responseJson<SpotifyEnrichStatusResponse>(
    await fetch("/api/admin/enrich/artists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", ambiguousOnly }),
    }),
  );

  let lastProcessed = status.progress?.processed ?? 0;
  onProgress(
    status.progress?.message ?? "Seeded tracks…",
    status.progress,
    status,
  );

  while (status.status === "processing" && status.job) {
    const progress = status.progress;
    const waitMs = progress?.waitingMs ?? 0;
    if (waitMs > 0) {
      onProgress(
        progress?.message ??
          `Waiting ${Math.ceil(waitMs / 1000)}s for Spotify rate limit…`,
        progress,
        status,
      );
      await sleep(waitMs);
    } else if (
      progress != null &&
      progress.processed === lastProcessed &&
      progress.processed > 0
    ) {
      await sleep(1_000);
    }

    lastProcessed = progress?.processed ?? lastProcessed;
    onProgress(
      "Fetching next Spotify batch…",
      progress,
      status,
    );
    status = await responseJson<SpotifyEnrichStatusResponse>(
      await fetch("/api/admin/enrich/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance", jobId: status.job.id }),
      }),
    );
    onProgress(
      status.progress?.message ??
        (status.status === "completed"
          ? "Spotify artist enrich completed."
          : "Enriching Spotify track artists…"),
      status.progress,
      status,
    );
  }

  if (status.status === "completed") {
    onProgress("Spotify artist enrich completed.", null, status);
    return status;
  }

  if (status.status === "failed") {
    throw new Error(
      status.job?.errorMessage ?? "Spotify artist enrich failed.",
    );
  }

  throw new Error(
    status.job?.errorMessage ?? "Spotify artist enrich did not complete.",
  );
}
