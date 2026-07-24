"use client";

import type { ReactNode } from "react";

import type {
  UndirectedMetric,
  WeightFormat,
} from "@/lib/relationship-graph-shared";
import { formatWeightValue } from "@/lib/relationship-graph-shared";
import { cn } from "@/lib/utils";

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
}: {
  /** Stacked under the slider (e.g. toggles) so the slider keeps full width. */
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
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
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
                {(threshold * 100).toFixed(0)}% of typical
              </span>
            </span>
            <input
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
                  ? `Cutoff ${formatWeightValue(rawThreshold, rawFormat)}${rawUnit ? ` ${rawUnit}` : ""}`
                  : null}
                {rawThreshold != null && scaleCaption ? " · " : null}
                {scaleCaption}
              </span>
            ) : null}
          </label>
          {belowThreshold ? (
            <div className="flex flex-col gap-2">{belowThreshold}</div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className={cn("flex flex-wrap items-center gap-3")}>{children}</div>
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
