"use client";

import {
  useId,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  filterPointBuckets,
  type PointBucket,
  type PointBucketRange,
} from "@/lib/point-buckets";

type Mode = "total" | "ratio";

type PieSlice = {
  bucket: PointBucket;
  share: number;
  startAngle: number;
  endAngle: number;
};

type PieHover = {
  slice: PieSlice;
  x: number;
  y: number;
};

const BUCKET_COLORS: Record<PointBucket["label"], string> = {
  "0": "#52525b",
  "1": "#71717a",
  "2": "#a78bfa",
  "3": "#8b5cf6",
  "4": "#a3e635",
  "5": "#bef264",
  "5+": "#facc15",
};

function formatPoints(value: number): string {
  return `${value.toLocaleString()} pts`;
}

function formatVotes(value: number): string {
  return `${value.toLocaleString()} votes`;
}

function buildPieSlices(
  buckets: PointBucket[],
  totalPoints: number,
): PieSlice[] {
  return buckets
    .filter((bucket) => bucket.pointTotal > 0)
    .reduce<PieSlice[]>((acc, bucket) => {
      const share = totalPoints ? bucket.pointTotal / totalPoints : 0;
      const startAngle = acc.at(-1)?.endAngle ?? 0;
      return [
        ...acc,
        {
          bucket,
          share,
          startAngle,
          endAngle: startAngle + share * 360,
        },
      ];
    }, []);
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
      className="flex rounded-full border border-white/10 bg-black/20 p-0.5"
      role="group"
    >
      <Button
        aria-pressed={mode === "total"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("total")}
        variant={mode === "total" ? "primary" : "ghost"}
      >
        Total
      </Button>
      <Button
        aria-pressed={mode === "ratio"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("ratio")}
        variant={mode === "ratio" ? "primary" : "ghost"}
      >
        Ratio
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
      className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5"
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

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function pieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) return "";
  if (sweep >= 359.999) {
    return [
      `M ${cx} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
      "Z",
    ].join(" ");
  }

  const largeArc = sweep > 180 ? 1 : 0;
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function RatioPie({
  buckets,
  totalPoints,
}: {
  buckets: PointBucket[];
  totalPoints: number;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<PieHover | null>(null);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 100;
  const slices = buildPieSlices(buckets, totalPoints);
  const activeLabel = hover?.slice.bucket.label ?? null;

  const updateHover = (
    slice: PieSlice,
    event: ReactPointerEvent<SVGElement>,
  ) => {
    const panelWidth = 208;
    const panelHeight = 112;
    const offset = 14;
    setHover({
      slice,
      x: Math.min(
        event.clientX + offset,
        window.innerWidth - panelWidth - 8,
      ),
      y: Math.min(
        event.clientY + offset,
        window.innerHeight - panelHeight - 8,
      ),
    });
  };

  const tooltip =
    hover && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-52 rounded-xl border border-white/15 bg-zinc-950/90 px-3 py-2.5 text-xs text-zinc-100 shadow-xl backdrop-blur-sm"
            role="tooltip"
            style={{
              left: hover.x,
              top: hover.y,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{
                  backgroundColor: BUCKET_COLORS[hover.slice.bucket.label],
                }}
              />
              <p className="font-mono text-sm font-semibold text-zinc-50">
                {hover.slice.bucket.label} points
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-zinc-500">Share</dt>
              <dd className="tabular-nums text-zinc-200">
                {(hover.slice.share * 100).toFixed(1)}%
              </dd>
              <dt className="text-zinc-500">Points</dt>
              <dd className="tabular-nums text-zinc-200">
                {hover.slice.bucket.pointTotal.toLocaleString()}
              </dd>
              <dt className="text-zinc-500">Votes</dt>
              <dd className="tabular-nums text-zinc-200">
                {hover.slice.bucket.count.toLocaleString()}
              </dd>
            </dl>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
      {tooltip}

      <div className="relative shrink-0">
        <svg
          aria-labelledby={titleId}
          className="h-[220px] w-[220px] touch-none"
          onPointerLeave={() => setHover(null)}
          role="img"
          viewBox={`0 0 ${size} ${size}`}
        >
          <title id={titleId}>
            {buckets
              .map(
                (bucket) =>
                  `${bucket.label} points: ${formatPoints(bucket.pointTotal)} across ${formatVotes(bucket.count)}`,
              )
              .join("; ")}
          </title>
          {slices.length === 0 ? (
            <circle
              cx={cx}
              cy={cy}
              fill="rgb(255 255 255 / 0.06)"
              r={radius}
            />
          ) : (
            slices.map((slice) => {
              const isActive = activeLabel === slice.bucket.label;
              const isDimmed = activeLabel != null && !isActive;
              return (
                <path
                  d={pieSlicePath(
                    cx,
                    cy,
                    isActive ? radius + 4 : radius,
                    slice.startAngle,
                    slice.endAngle,
                  )}
                  fill={BUCKET_COLORS[slice.bucket.label]}
                  key={slice.bucket.label}
                  onPointerEnter={(event) => updateHover(slice, event)}
                  onPointerMove={(event) => updateHover(slice, event)}
                  opacity={isDimmed ? 0.35 : 1}
                  stroke="rgb(9 9 11 / 0.55)"
                  strokeWidth={1}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 120ms ease",
                  }}
                />
              );
            })
          )}
        </svg>
      </div>
      <div className="w-full max-w-[11rem]">
        <p className="mb-2 text-[11px] text-zinc-500">
          Total{" "}
          <span className="font-mono tabular-nums text-zinc-200">
            {totalPoints.toLocaleString()}
          </span>{" "}
          pts
        </p>
        <ul className="grid grid-cols-1 gap-1.5">
          {buckets.map((bucket) => {
            const share = totalPoints ? bucket.pointTotal / totalPoints : 0;
            const isActive = activeLabel === bucket.label;
            return (
              <li
                className={`flex min-w-0 items-baseline gap-2 text-[11px] transition-opacity ${
                  activeLabel != null && !isActive
                    ? "opacity-40"
                    : "opacity-100"
                }`}
                key={bucket.label}
              >
                <span
                  aria-hidden="true"
                  className="mt-1 size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: BUCKET_COLORS[bucket.label] }}
                />
                <span className="w-5 shrink-0 font-mono text-zinc-200">
                  {bucket.label}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {(share * 100).toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TotalBars({ buckets }: { buckets: PointBucket[] }) {
  const maximum = Math.max(1, ...buckets.map(({ pointTotal }) => pointTotal));

  return (
    <div
      aria-label={buckets
        .map(
          ({ count, label, pointTotal }) =>
            `${label}: ${formatPoints(pointTotal)} across ${formatVotes(count)}`,
        )
        .join(", ")}
      className={
        buckets.length > 5
          ? "grid h-52 grid-cols-7 items-end gap-2"
          : "grid h-52 grid-cols-5 items-end gap-2"
      }
      role="img"
    >
      {buckets.map((bucket) => (
        <div className="min-w-0 text-center" key={bucket.label}>
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
          <p className="mt-2 font-mono text-xs text-zinc-300">{bucket.label}</p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
            {formatPoints(bucket.pointTotal)}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-600">
            {formatVotes(bucket.count)}
          </p>
        </div>
      ))}
    </div>
  );
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
  const totalPoints = buckets.reduce(
    (sum, bucket) => sum + bucket.pointTotal,
    0,
  );

  return (
    <div className="space-y-4">
      {showModeToggle ? (
        <div className="flex justify-end">
          <ModeToggle label={modeLabel} mode={mode} onChange={onModeChange} />
        </div>
      ) : null}
      {mode === "ratio" ? (
        <RatioPie buckets={buckets} totalPoints={totalPoints} />
      ) : (
        <TotalBars buckets={buckets} />
      )}
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
