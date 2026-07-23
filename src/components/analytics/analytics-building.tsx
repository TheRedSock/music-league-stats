"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

/** Polls the relationships page; each load advances one combo materialization step. */
export function ScopeMaterializationSplash({
  progressLabel,
  errorMessage,
}: {
  progressLabel?: string | null;
  errorMessage?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (errorMessage) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, 1500);
    return () => {
      window.clearInterval(timer);
    };
  }, [errorMessage, router]);

  if (errorMessage) {
    return (
      <Card className="mx-auto max-w-xl border-red-300/20">
        <CardHeader>
          <CardTitle>Could not compute this league combination</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AnalyticsBuildingSplash
      description="This multi-league relationship view is computed once when you apply the scope filter, then stored for reuse."
      progressLabel={progressLabel ?? "Computing league combination…"}
      title="Computing selected leagues"
    />
  );
}
