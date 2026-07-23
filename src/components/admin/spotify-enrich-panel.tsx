"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
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
  runSteppedSpotifyEnrich,
  type SpotifyEnrichProgress,
  type SpotifyEnrichStatusResponse,
} from "@/lib/spotify-enrich-client";

function formatStatus(
  initial: SpotifyEnrichStatusResponse | null,
): { label: string; variant: "success" | "muted" } {
  if (!initial || initial.status === "missing") {
    return { label: "Not run", variant: "muted" };
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
  return { label: "Idle", variant: "muted" };
}

export function SpotifyEnrichPanel({
  initialStatus,
}: {
  initialStatus: SpotifyEnrichStatusResponse | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [ambiguousOnly, setAmbiguousOnly] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<SpotifyEnrichProgress | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const badge = formatStatus(status);
  const counts = status?.counts;

  const candidateCount = ambiguousOnly
    ? (counts?.ambiguousPending ?? 0)
    : (counts?.allPending ?? 0);

  async function handleEnrich() {
    setPending(true);
    setError("");
    setMessage("");
    setProgress(null);
    try {
      const result = await runSteppedSpotifyEnrich(
        ambiguousOnly,
        (nextMessage, nextProgress, nextStatus) => {
          setMessage(nextMessage);
          setProgress(nextProgress);
          if (nextStatus) setStatus(nextStatus);
        },
      );
      setStatus(result);
      setProgress(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Spotify artist enrich failed.",
      );
      setMessage("");
      setProgress(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(
          100,
          Math.round((progress.processed / progress.total) * 100),
        )
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
              <Sparkles aria-hidden="true" className="size-4 text-lime-300" />
              Spotify artist enrich
            </CardTitle>
            <CardDescription className="mt-1">
              Resolve collab credits via Spotify{" "}
              <code className="text-zinc-300">track.artists[]</code> so Facts
              artist streaks split correctly. Prefer ambiguous-only to skip
              single-artist tracks.
            </CardDescription>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <input
            checked={ambiguousOnly}
            className="mt-1 size-4 accent-lime-300"
            disabled={pending}
            onChange={(event) => setAmbiguousOnly(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="font-medium text-zinc-100">
              Ambiguous collabs only
            </span>
            <span className="mt-0.5 block text-zinc-500">
              Seed tracks whose CSV artist string looks multi-credit (
              {counts
                ? `${counts.ambiguousPending} candidates`
                : "…"}
              ). Uncheck to enrich all tracks not yet ok (
              {counts ? `${counts.allPending} candidates` : "…"}
              ).
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>ok {counts?.enrichedOk ?? 0}</span>
          <span>pending {counts?.pending ?? 0}</span>
          <span>not found {counts?.notFound ?? 0}</span>
          <span>error {counts?.error ?? 0}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending} onClick={handleEnrich} type="button">
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            {pending
              ? "Enriching…"
              : `Enrich ${candidateCount} track${candidateCount === 1 ? "" : "s"}`}
          </Button>
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
        ) : status?.status === "completed" ? (
          <p className="text-sm text-zinc-400">
            Artist splits are ready for Facts. Re-run after new imports to
            catch new collabs.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            Progress updates after each Spotify batch; rate limits wait and
            continue.
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
