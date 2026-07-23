"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ScopeStatus = {
  status: string;
  scopeKey: string;
  progress: {
    stepLabel: string;
    stepIndex: number;
    stepCount: number;
  } | null;
  job?: { id: string; errorMessage?: string | null } | null;
};

class ScopeHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ScopeHttpError";
  }
}

async function getScopeStatus(scopeKey: string): Promise<ScopeStatus> {
  const response = await fetch(
    `/api/analytics/scope/refresh?scopeKey=${encodeURIComponent(scopeKey)}`,
  );
  const result = (await response.json()) as ScopeStatus & { error?: string };
  if (!response.ok) {
    throw new ScopeHttpError(result.error ?? "Scope status failed.", response.status);
  }
  return result;
}

async function postScope(body: Record<string, unknown>): Promise<ScopeStatus> {
  const response = await fetch("/api/analytics/scope/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as ScopeStatus & { error?: string };
  if (!response.ok) {
    throw new ScopeHttpError(result.error ?? "Scope refresh failed.", response.status);
  }
  return result;
}

function progressMessage(status: ScopeStatus, fallback: string): string {
  const progress = status.progress;
  return progress
    ? `${progress.stepLabel} (${progress.stepIndex + 1}/${progress.stepCount})…`
    : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function AnalyticsBuildingSplash({
  title = "Analytics are building",
  description = "Precomputed stats are being refreshed. This page will unlock when the cache is ready.",
  progressLabel,
}: {
  title?: string;
  description?: string;
  progressLabel?: string | null;
}) {
  return (
    <Card className="mx-auto max-w-xl border-amber-300/20">
      <CardHeader>
        <LoaderCircle
          aria-hidden="true"
          className="mb-3 size-7 animate-spin text-amber-200"
        />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {progressLabel ? (
        <CardContent>
          <p aria-live="polite" className="text-sm text-zinc-300">
            {progressLabel}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function ScopeMaterializationSplash({
  leagueIds,
  scopeKey,
}: {
  leagueIds: string[];
  scopeKey: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("Checking league combination…");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let status = await getScopeStatus(scopeKey);

        if (status.status === "completed") {
          setMessage("Ready — refreshing…");
          router.refresh();
          return;
        }

        if (status.status !== "processing") {
          try {
            status = await postScope({ action: "start", leagueIds });
          } catch (caught) {
            if (caught instanceof ScopeHttpError && caught.status === 401) {
              throw new Error(
                "This league combination is not cached yet. Sign in as admin and open this view to compute it.",
              );
            }
            throw caught;
          }
        }

        while (!cancelled && status.status === "processing" && status.job) {
          setMessage(progressMessage(status, "Computing league combination…"));
          try {
            status = await postScope({
              action: "advance",
              jobId: status.job.id,
            });
          } catch (caught) {
            if (!(caught instanceof ScopeHttpError) || caught.status !== 401) {
              throw caught;
            }
            // Non-admin visitors wait for an in-flight admin-driven job.
            while (!cancelled) {
              await sleep(2000);
              status = await getScopeStatus(scopeKey);
              setMessage(
                progressMessage(status, "Waiting for combination cache…"),
              );
              if (status.status === "completed") break;
              if (status.status === "failed") {
                throw new Error(
                  status.job?.errorMessage ?? "Scope materialization failed.",
                );
              }
              if (status.status !== "processing") {
                throw new Error(
                  "Scope materialization stopped before completing.",
                );
              }
            }
            break;
          }
        }

        if (cancelled) return;
        if (status.status !== "completed") {
          throw new Error(
            status.job?.errorMessage ?? "Scope materialization did not complete.",
          );
        }
        setMessage("Ready — refreshing…");
        router.refresh();
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Scope refresh failed.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueIds, router, scopeKey]);

  if (error) {
    return (
      <Card className="mx-auto max-w-xl border-red-300/20">
        <CardHeader>
          <CardTitle>Could not compute this league combination</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AnalyticsBuildingSplash
      description="This multi-league relationship view is computed once and stored for reuse."
      progressLabel={message}
      title="Computing selected leagues"
    />
  );
}
