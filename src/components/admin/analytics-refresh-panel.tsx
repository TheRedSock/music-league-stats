"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LEAGUE_CALCULATIONS } from "@/lib/analytics-job-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  runSteppedAnalyticsRefresh,
  readAnalyticsRefreshStatus,
  type AnalyticsRefreshProgress,
  type AnalyticsRefreshStatusResponse,
} from "@/lib/analytics-refresh-client";

function formatStatus(
  initial: AnalyticsRefreshStatusResponse | null,
): { label: string; variant: "success" | "muted" } {
  if (!initial || initial.status === "missing") {
    return { label: "Not built", variant: "muted" };
  }
  if (initial.status === "completed") {
    return { label: "Ready", variant: "success" };
  }
  if (initial.status === "failed") {
    return { label: "Failed", variant: "muted" };
  }
  if (initial.status === "processing") {
    return { label: "In progress", variant: "muted" };
  }
  return { label: "Needs refresh", variant: "muted" };
}

export function AnalyticsRefreshPanel({
  initialStatus,
}: {
  initialStatus: AnalyticsRefreshStatusResponse | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<AnalyticsRefreshProgress | null>(
    null,
  );
  const [observedStatus, setStatus] = useState<AnalyticsRefreshStatusResponse | null>(null);
  const status = observedStatus && (!initialStatus ||
    new Date(observedStatus.job?.updatedAt ?? 0).getTime() >= new Date(initialStatus.job?.updatedAt ?? 0).getTime())
    ? observedStatus : initialStatus;
  const savedProgress = progress ?? status?.progress;
  const badge = pending ? { label: "In progress", variant: "muted" as const } : formatStatus(status);

  async function handleRefresh() {
    setPending(true);
    setError("");
    setMessage("");
    setProgress(null);
    try {
      const result = await runSteppedAnalyticsRefresh((nextMessage, nextProgress) => {
        setMessage(nextMessage);
        setProgress(nextProgress);
      });
      setStatus(result);
      setProgress(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "All-leagues analytics refresh failed.",
      );
      setMessage("");
      try { setStatus(await readAnalyticsRefreshStatus()); setProgress(null); } catch { /* Keep the last known checkpoint. */ }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const leagueFraction = savedProgress?.stepId === "league-scopes" && savedProgress.leagueCount
    ? ((savedProgress.leagueIndex ?? 0) * LEAGUE_CALCULATIONS.length + (savedProgress.leagueStepIndex ?? 0)) /
      (savedProgress.leagueCount * LEAGUE_CALCULATIONS.length)
    : 0;
  const percent =
    savedProgress && savedProgress.stepCount > 0
      ? Math.round(((savedProgress.stepIndex + leagueFraction) / savedProgress.stepCount) * 100)
      : pending
        ? 5
        : status?.status === "completed"
          ? 100
          : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw aria-hidden="true" className="size-4 text-lime-300" />
              Analytics
            </CardTitle>
            <CardDescription className="mt-1">
              Update results after imports or player edits. Interrupted refreshes resume from the last completed step.
            </CardDescription>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending} onClick={handleRefresh} type="button">
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            {pending ? "Refreshing…" : status?.progress ? "Resume analytics refresh" : "Refresh analytics"}
          </Button>
          {status?.analyticsRevision ? (
            <details className="text-xs text-zinc-500"><summary className="cursor-pointer">Revision</summary><p className="mt-2 font-mono">{status.analyticsRevision}</p></details>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="h-2 overflow-hidden rounded-full bg-white/[0.06]"
        >
          <div
            className="h-full rounded-full bg-lime-300/80 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {message ? (
          <p aria-live="polite" className="text-sm text-zinc-300">
            {message}
          </p>
        ) : status?.status === "completed" && status.job?.summary ? (
          <p className="text-sm text-zinc-400">
            Results are up to date.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            {savedProgress ? `Saved checkpoint: ${savedProgress.stepLabel}. Keep this page open while refreshing.` : "Progress is saved after each calculation."}
          </p>
        )}

        {!pending && (error || status?.job?.errorMessage) ? (
          <p aria-live="assertive" className="text-sm text-red-300">
            {error || status?.job?.errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
