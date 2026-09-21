"use client";

import type { ReactNode } from "react";

import type {
  UndirectedMetric,
  WeightFormat,
} from "@/lib/relationship-graph-shared";
import { formatWeightValue } from "@/lib/relationship-graph-shared";

export function LabsControls({
  belowThreshold,
  children,
  metric,
  onMetricChange,
  onThresholdChange,
  rawFormat = "ratio",
  rawThreshold,
  rawUnit = "",
  scaleCaption,
  showMetric = true,
  threshold,
  thresholdLabel = "Min strength",
  densityScale = false,
  unfiltered = false,
  onUnfilteredChange,
}: {
  /** Extra controls sharing a wrapping row below the slider. */
  belowThreshold?: ReactNode;
  children?: ReactNode;
  metric?: UndirectedMetric;
  onMetricChange?: (metric: UndirectedMetric) => void;
  onThresholdChange: (normalized: number) => void;
  rawFormat?: WeightFormat;
  rawThreshold?: number;
  rawUnit?: string;
  scaleCaption?: string;
  showMetric?: boolean;
  threshold: number;
  thresholdLabel?: string;
  densityScale?: boolean;
  unfiltered?: boolean;
  onUnfilteredChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
        {showMetric && metric && onMetricChange ? (
          <label className="space-y-1.5 text-xs text-zinc-400">
            <span className="block">Metric</span>
            <select
              className="h-9 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
              onChange={(event) =>
                onMetricChange(event.target.value as UndirectedMetric)
              }
              value={metric}
            >
              <option value="alignment">Vote-pattern alignment</option>
              <option value="mutual">Mutual ballot share</option>
            </select>
          </label>
        ) : null}
        <div className="min-w-[240px] flex-1 space-y-2">
          <label className="block space-y-1.5 text-xs text-zinc-400">
            <span className="flex justify-between gap-3">
              <span>{thresholdLabel}</span>
              <span className="tabular-nums text-zinc-200">
                {unfiltered ? "Unfiltered" : `${(threshold * 100).toFixed(0)}%${densityScale && threshold === 0.5 ? " · balanced" : " filtering"}`}
              </span>
            </span>
            <input
              title={densityScale
                ? "Controls the number of strongest links per player: 0% is dense, 50% is balanced, and 100% has no qualifying links. Equal strengths stay together; fallback links are separate."
                : "Filters by the rank of link strengths in this scope: 0% shows all links; 100% leaves no qualifying links. Equal strengths are filtered together."}
              disabled={unfiltered}
              className="w-full accent-lime-300"
              max={1}
              min={0}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
              step={0.01}
              type="range"
              value={threshold}
            />
            {rawThreshold != null || scaleCaption ? (
              <span className="block text-[11px] leading-4 text-zinc-500">
                {rawThreshold != null
                  ? !unfiltered && threshold >= 1 ? "Cutoff above strongest link" : `Cutoff ${formatWeightValue(rawThreshold, rawFormat)}${rawUnit ? ` ${rawUnit}` : ""}`
                  : null}
                {rawThreshold != null && scaleCaption ? " · " : null}
                {scaleCaption}
                {densityScale ? " · 0% dense; 50% balanced; 100% no qualifying links" : " · 0% all links; 100% no qualifying links"}
              </span>
            ) : null}
          </label>
          {onUnfilteredChange || belowThreshold ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {onUnfilteredChange ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <input checked={unfiltered} className="size-3.5 accent-lime-300" onChange={event => onUnfilteredChange(event.target.checked)} type="checkbox" />
                  <span>Show all links (unfiltered)</span>
                </label>
              ) : null}
              {belowThreshold}
            </div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}

export function FocusPlayerSelect({
  nodes,
  onChange,
  value,
}: {
  nodes: Array<{ id: string; name: string }>;
  onChange: (id: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5 text-xs text-zinc-400">
      <span className="block">Focus player</span>
      <select
        className="h-9 min-w-[180px] rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GraphEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-6 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
