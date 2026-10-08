"use client";

import { formatPoints } from "@/lib/format";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  filterPointBuckets,
  type PointBucket,
  type PointBucketRange,
} from "@/lib/point-buckets";

type Mode = "total" | "ratio";

function formatVotes(value: number): string {
  return `${value.toLocaleString()} ${value === 1 ? "vote" : "votes"}`;
}

function ModeToggle({
  mode,
  onChange,
  label,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className="flex rounded-md border border-white/10 bg-black/20 p-0.5"
      role="group"
    >
      <Button
        aria-pressed={mode === "total"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("total")}
        variant={mode === "total" ? "primary" : "ghost"}
      >
        Vote count
      </Button>
      <Button
        aria-pressed={mode === "ratio"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("ratio")}
        variant={mode === "ratio" ? "primary" : "ghost"}
      >
        Vote share
      </Button>
    </div>
  );
}

export function RangeToggle({
  range,
  onChange,
}: {
  range: PointBucketRange;
  onChange: (range: PointBucketRange) => void;
}) {
  return (
    <div
      aria-label="Point bucket range"
      className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5"
      role="group"
    >
      <Button
        aria-pressed={range === "standard"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("standard")}
        variant={range === "standard" ? "primary" : "ghost"}
      >
        1-5
      </Button>
      <Button
        aria-pressed={range === "extended"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("extended")}
        variant={range === "extended" ? "primary" : "ghost"}
      >
        Include 0 &amp; 5+
      </Button>
    </div>
  );
}

function VoteBars({ buckets, mode }: { buckets: PointBucket[]; mode: Mode }) {
  const maximum = Math.max(1, ...buckets.map(bucket => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return <ul className="space-y-3" aria-label={mode === "total" ? "Vote counts by score" : "Vote shares by score"}>
    {buckets.map(bucket => <li key={bucket.label} className="grid grid-cols-[3rem_1fr_5.5rem] items-center gap-3 text-xs">
      <span className="text-zinc-300">{bucket.label} {bucket.label === "1" ? "pt" : "pts"}</span>
      <span aria-hidden="true" className="h-3 bg-white/5"><span className="block h-full bg-lime-300/75" style={{width: `${bucket.count / maximum * 100}%`}} /></span>
      <span className="text-right tabular-nums text-zinc-300">{mode === "total" ? formatVotes(bucket.count) : `${(total ? bucket.count / total * 100 : 0).toFixed(1)}%`}</span>
    </li>)}
  </ul>;
}

export function PointBucketDisplay({
  buckets,
  mode,
  onModeChange,
  modeLabel = "Point distribution display",
  showModeToggle = true,
}: {
  buckets: PointBucket[];
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  modeLabel?: string;
  showModeToggle?: boolean;
}) {
  const totalPoints = buckets.reduce((sum, bucket) => sum + bucket.pointTotal, 0);

  return (
    <div className="space-y-4">
      {showModeToggle ? (
        <div className="flex justify-end">
          <ModeToggle label={modeLabel} mode={mode} onChange={onModeChange} />
        </div>
      ) : null}
      <VoteBars buckets={buckets} mode={mode} />
      <p className="text-xs text-zinc-400">{formatPoints(totalPoints)} in the displayed scores. Shares use votes in this range.</p>
    </div>
  );
}

export function PointDistributionChart({
  buckets,
}: {
  buckets: PointBucket[];
}) {
  const [range, setRange] = useState<PointBucketRange>("standard");
  const [mode, setMode] = useState<Mode>("total");
  const visibleBuckets = filterPointBuckets(buckets, range);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeToggle onChange={setRange} range={range} />
        <ModeToggle
          label="Eligible vote points display"
          mode={mode}
          onChange={setMode}
        />
      </div>
      <PointBucketDisplay
        buckets={visibleBuckets}
        mode={mode}
        modeLabel="Eligible vote points display"
        onModeChange={setMode}
        showModeToggle={false}
      />
    </div>
  );
}

export function PointDistributionSection({
  buckets,
  range,
  title,
}: {
  buckets: PointBucket[];
  range: PointBucketRange;
  title: string;
}) {
  const [mode, setMode] = useState<Mode>("total");
  const visibleBuckets = filterPointBuckets(buckets, range);
  const headingId = `${title.replaceAll(" ", "-")}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100" id={headingId}>
          {title}
        </h3>
        <ModeToggle
          label={`${title} display`}
          mode={mode}
          onChange={setMode}
        />
      </div>
      <div className="mt-4">
        <PointBucketDisplay
          buckets={visibleBuckets}
          mode={mode}
          onModeChange={setMode}
          showModeToggle={false}
        />
      </div>
    </section>
  );
}
