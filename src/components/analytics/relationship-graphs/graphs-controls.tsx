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
  return <div className="flex min-w-0 flex-wrap items-start gap-4 rounded-lg border border-white/10 p-4">
    {showMetric && metric && onMetricChange ? <label className="text-xs text-zinc-400"><span className="mb-2 block">Measure</span>
      <select className="h-9 max-w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100" value={metric} onChange={event => onMetricChange(event.target.value as UndirectedMetric)}><option value="alignment">Voting similarity</option><option value="mutual">Mutual ballot share</option></select>
    </label> : null}
    <div className="min-w-0 flex-1 basis-64">
      <label className="block text-xs text-zinc-400"><span className="mb-2 block">Connections</span>
        <input aria-label={thresholdLabel} aria-valuetext={unfiltered ? "All connections" : `${Math.round((1-threshold)*100)}% connection density`} type="range" min={0} max={1} step={0.01} disabled={unfiltered} value={threshold} onChange={event => onThresholdChange(Number(event.target.value))} className="w-full accent-lime-300" />
      </label>
      <div className="mt-1 flex justify-between text-xs text-zinc-400"><span>More</span><span>Fewer</span></div>
      <details className="mt-3 text-xs text-zinc-400"><summary className="cursor-pointer">Advanced options</summary>
        <p className="my-3 leading-5">{rawThreshold != null ? `${!unfiltered && threshold >= 1 ? "Above strongest connection" : `Cutoff ${formatWeightValue(rawThreshold, rawFormat)}${rawUnit ? ` ${rawUnit}` : ""}`}. ` : ""}{scaleCaption}{densityScale ? " · density follows the strongest connections per player" : " · filtered by connection rank"}</p>
        {onUnfilteredChange ? <label className="mb-2 flex items-center gap-2"><input type="checkbox" className="accent-lime-300" checked={unfiltered} onChange={event => onUnfilteredChange(event.target.checked)} />Show all connections</label> : null}
        {belowThreshold}
      </details>
    </div>
    {children}
  </div>;
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
        className="h-9 w-full max-w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
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
    <div className="flex h-[420px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-950/40 px-6 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
