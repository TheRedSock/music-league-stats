"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PointBucket } from "@/lib/analytics";

type Mode = "total" | "ratio";

function Distribution({
  buckets,
  title,
}: {
  buckets: PointBucket[];
  title: string;
}) {
  const [mode, setMode] = useState<Mode>("total");
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const maximum = Math.max(
    1,
    ...buckets.map((bucket) =>
      mode === "total" ? bucket.count : total ? bucket.count / total : 0,
    ),
  );

  return (
    <section aria-labelledby={`${title.replaceAll(" ", "-")}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3
          className="text-sm font-semibold text-zinc-100"
          id={`${title.replaceAll(" ", "-")}-heading`}
        >
          {title}
        </h3>
        <div
          aria-label={`${title} display`}
          className="flex rounded-full border border-white/10 bg-black/20 p-0.5"
          role="group"
        >
          <Button
            aria-pressed={mode === "total"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setMode("total")}
            variant={mode === "total" ? "primary" : "ghost"}
          >
            Total
          </Button>
          <Button
            aria-pressed={mode === "ratio"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setMode("ratio")}
            variant={mode === "ratio" ? "primary" : "ghost"}
          >
            Ratio
          </Button>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-2" role="list">
        {buckets.map((bucket) => {
          const value =
            mode === "total"
              ? bucket.count
              : total
                ? bucket.count / total
                : 0;
          return (
            <div className="min-w-0 text-center" key={bucket.label} role="listitem">
              <div className="flex h-28 items-end overflow-hidden rounded-lg bg-white/[0.035]">
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-md bg-gradient-to-t from-violet-500/70 to-lime-300/80 transition-[height]"
                  style={{ height: `${Math.max(value ? 4 : 0, (value / maximum) * 100)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-xs font-medium text-zinc-200">
                {bucket.label}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {mode === "total"
                  ? bucket.count.toLocaleString()
                  : `${(value * 100).toFixed(0)}%`}
              </p>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        {buckets
          .map((bucket) => `${bucket.label} points: ${bucket.count} votes`)
          .join("; ")}
      </p>
    </section>
  );
}

export function VoteDistributions({
  received,
  given,
}: {
  received: PointBucket[];
  given: PointBucket[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Distribution buckets={received} title="Points received" />
      <Distribution buckets={given} title="Points given" />
    </div>
  );
}
