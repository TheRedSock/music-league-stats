"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  filterPointBuckets,
  type PointBucket,
  type PointBucketRange,
} from "@/lib/point-buckets";

export function PointDistributionChart({
  buckets,
}: {
  buckets: PointBucket[];
}) {
  const [range, setRange] = useState<PointBucketRange>("standard");
  const visibleBuckets = filterPointBuckets(buckets, range);
  const maximum = Math.max(
    1,
    ...visibleBuckets.map(({ pointTotal }) => pointTotal),
  );

  return (
    <div>
      <div
        aria-label="Point bucket range"
        className="mb-4 inline-flex rounded-full border border-white/10 bg-black/20 p-0.5"
        role="group"
      >
        <Button
          aria-pressed={range === "standard"}
          className="h-7 px-2.5 text-xs"
          onClick={() => setRange("standard")}
          variant={range === "standard" ? "primary" : "ghost"}
        >
          1-5
        </Button>
        <Button
          aria-pressed={range === "extended"}
          className="h-7 px-2.5 text-xs"
          onClick={() => setRange("extended")}
          variant={range === "extended" ? "primary" : "ghost"}
        >
          Include 0 &amp; 5+
        </Button>
      </div>
      <div
        aria-label={visibleBuckets
          .map(
            ({ count, label, pointTotal }) =>
              `${label}: ${pointTotal} points across ${count} votes`,
          )
          .join(", ")}
        className={
          range === "extended"
            ? "grid h-52 grid-cols-7 items-end gap-2"
            : "grid h-52 grid-cols-5 items-end gap-2"
        }
        role="img"
      >
        {visibleBuckets.map((bucket) => (
          <div className="text-center" key={bucket.label}>
            <div className="flex h-36 items-end rounded-lg bg-white/[0.035]">
              <div
                aria-hidden="true"
                className="w-full rounded-t-md bg-gradient-to-t from-violet-500/70 to-lime-300/80"
                style={{
                  height: `${Math.max(
                    bucket.pointTotal ? 3 : 0,
                    (bucket.pointTotal / maximum) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-zinc-300">
              {bucket.label}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              {bucket.pointTotal.toLocaleString()} pts
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-700">
              {bucket.count.toLocaleString()} votes
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
