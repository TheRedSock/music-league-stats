"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [status, setStatus] = useState(initialStatus);
  const badge = formatStatus(status);

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
      setProgress(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const percent =
    progress && progress.stepCount > 0
      ? Math.round(((progress.stepIndex + 1) / progress.stepCount) * 100)
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
              All-leagues analytics cache
            </CardTitle>
            <CardDescription className="mt-1">
              Rebuild the persistent empty-scope stats used by the dashboard,
              songs, players, compare, and profiles. Run this after imports or
              name/slug edits.
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
            {pending ? "Refreshing…" : "Refresh all-leagues stats"}
          </Button>
          {status?.analyticsRevision ? (
            <p className="font-mono text-xs text-zinc-500">
              revision {status.analyticsRevision}
            </p>
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
            Cached rows are ready for empty-scope pages.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            Progress updates after each step so the browser stays responsive.
          </p>
        )}

        {error ? (
          <p aria-live="assertive" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
