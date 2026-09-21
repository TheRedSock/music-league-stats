export type RelationshipGraphNode = {
  id: string;
  name: string;
};

export type UndirectedRelationshipEdge = {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  alignment: number | null;
  mutualShare: number | null;
  sharedRounds: number | null;
  comparableFeatures: number | null;
  mutualPoints: number | null;
};

export type DirectedRelationshipEdge = {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  pointsPerOpportunity: number;
  points: number;
  opportunities: number;
  positiveRate: number;
  sharedRounds: number;
};

export type RelationshipGraphData = {
  nodes: RelationshipGraphNode[];
  undirectedEdges: UndirectedRelationshipEdge[];
  directedEdges: DirectedRelationshipEdge[];
  needsScopeMaterialization?: boolean;
  scopeKey?: string;
};

export type UndirectedMetric = "alignment" | "mutual";

/** Matrix starts unfiltered; other views choose a density-based default. */
export const LAB_DEFAULT_NORMALIZED = { matrix: 0 } as const;

/** Matrix/Ego use quantiles; network views use a bounded per-player edge budget. */
export type WeightScale = {
  low: number;
  high: number;
  sorted: number[];
  defaultNormalized: number;
  sampleSize: number;
  edgeBudget?: number;
  levels?: Array<{ cutoff: number; count: number }>;
};

export function edgeWeight(
  edge: UndirectedRelationshipEdge,
  metric: UndirectedMetric,
): number | null {
  return metric === "alignment" ? edge.alignment : edge.mutualShare;
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  if (sortedAscending.length === 1) return sortedAscending[0];
  const clamped = Math.min(1, Math.max(0, p));
  const index = (sortedAscending.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedAscending[lower];
  const t = index - lower;
  return sortedAscending[lower] + (sortedAscending[upper] - sortedAscending[lower]) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Choose the closest attainable edge count to a visual density target.
 * Ties are never split arbitrarily. Prefer the sparser result on equal error.
 */
export function buildWeightScale(weights: readonly number[], targetEdges = weights.length / 2): WeightScale {
  const sorted = weights.filter(Number.isFinite).sort((a, b) => a - b);
  const scale: WeightScale = {
    low: sorted[0] ?? 0,
    high: sorted.at(-1) ?? 1,
    sorted,
    defaultNormalized: 0,
    sampleSize: sorted.length,
  };
  if (!sorted.length) return scale;
  const target = Math.max(1, Math.min(sorted.length, targetEdges));
  let bestError = Infinity;
  let bestCount = Infinity;
  for (let step = 0; step < 100; step += 1) {
    const cutoff = normalizedToRaw(step / 100, scale);
    const count = sorted.filter(weight => weight >= cutoff).length;
    const error = Math.abs(count - target);
    if (count > 0 && (error < bestError || (error === bestError && count < bestCount))) {
      bestError = error;
      bestCount = count;
      scale.defaultNormalized = step / 100;
    }
  }
  return scale;
}

export function undirectedWeightScale(
  edges: readonly UndirectedRelationshipEdge[],
  metric: UndirectedMetric,
  targetEdges?: number,
): WeightScale {
  const weights: number[] = [];
  for (const edge of edges) {
    const weight = edgeWeight(edge, metric);
    if (weight != null) weights.push(weight);
  }
  const nodes = new Set(edges.filter(edge => edgeWeight(edge, metric) != null).flatMap(edge => [edge.source, edge.target]));
  return buildWeightScale(weights, targetEdges ?? nodes.size);
}

export function directedWeightScale(
  edges: readonly DirectedRelationshipEdge[],
): WeightScale {
  const nodes = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  return buildDensityWeightScale(edges.map((edge) => edge.pointsPerOpportunity), nodes.size, 1.5);
}

/** A network has O(n²) possible links but only O(n) readable links.
 * Spread that useful density range over the entire control. At 50%, Flow
 * targets 1.5 arrows/player and Bubbles 1.25 undirected links/player. At 0%
 * the budget doubles; at 100% no primary links remain. Full data is a separate
 * unfiltered mode. Selecting an attainable count keeps equal weights together.
 */
export function buildDensityWeightScale(
  weights: readonly number[],
  nodeCount: number,
  linksPerPlayer: number,
): WeightScale {
  const sorted = weights.filter(Number.isFinite).sort((a, b) => a - b);
  const levels = sorted.flatMap((cutoff, index) =>
    index === 0 || cutoff !== sorted[index - 1]
      ? [{ cutoff, count: sorted.length - index }]
      : [],
  );
  return {
    low: sorted[0] ?? 0,
    high: sorted.at(-1) ?? 1,
    sorted,
    sampleSize: sorted.length,
    defaultNormalized: 0.5,
    edgeBudget: Math.min(sorted.length, Math.max(0, nodeCount * linksPerPlayer * 2)),
    levels,
  };
}

export function bubbleWeightScale(edges: readonly UndirectedRelationshipEdge[]): WeightScale {
  const eligible = edges.filter(edge => edge.alignment != null && Number.isFinite(edge.alignment));
  const nodes = new Set(eligible.flatMap(edge => [edge.source, edge.target]));
  return buildDensityWeightScale(eligible.map(edge => edge.alignment!), nodes.size, 1.25);
}

export function normalizedToRaw(
  normalized: number,
  scale: WeightScale,
): number {
  if (normalized >= 1) return scale.high + Math.max(1e-9, Math.abs(scale.high) * 1e-9);
  if (scale.edgeBudget != null && scale.levels?.length) {
    const target = scale.edgeBudget * (1 - clamp01(normalized));
    let best = scale.levels[0];
    for (const level of scale.levels) {
      const error = Math.abs(level.count - target);
      const bestError = Math.abs(best.count - target);
      if (error < bestError || (error === bestError && level.count < best.count)) best = level;
    }
    return best.cutoff;
  }
  return percentile(scale.sorted, clamp01(normalized));
}

export type WeightFormat = "ratio" | "absolute";

export function formatWeightValue(
  value: number,
  format: WeightFormat = "ratio",
  digits = 1,
): string {
  if (format === "absolute") return value.toFixed(Math.max(digits, 2));
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatScaleCaption(
  scale: WeightScale,
  format: WeightFormat = "ratio",
  unit = "",
): string {
  if (scale.sampleSize === 0) return "no samples";
  const suffix = unit ? ` ${unit}` : "";
  return `observed ${formatWeightValue(scale.low, format)}–${formatWeightValue(scale.high, format)}${suffix} · ties stay together`;
}

export function filterUndirectedEdges(
  edges: UndirectedRelationshipEdge[],
  metric: UndirectedMetric,
  rawThreshold: number,
): UndirectedRelationshipEdge[] {
  return edges.filter((edge) => {
    const weight = edgeWeight(edge, metric);
    return weight != null && weight >= rawThreshold;
  });
}

export function filterDirectedEdges(
  edges: DirectedRelationshipEdge[],
  rawThreshold: number,
): DirectedRelationshipEdge[] {
  return edges.filter((edge) => edge.pointsPerOpportunity >= rawThreshold);
}

/**
 * Heatmap color domain: low = active hide cutoff (so cutoff is the coolest
 * visible tint), high = strong observed values (P98 / max) so the top of the
 * data is not crushed into one muddled shade.
 */
export function colorDomainFromVisibleWeights(
  visibleWeights: readonly number[],
  cutoff: number,
  allWeights: readonly number[] = visibleWeights,
): [number, number] {
  const finiteVisible = visibleWeights.filter((value) => Number.isFinite(value));
  const finiteAll = allWeights.filter((value) => Number.isFinite(value));
  if (finiteVisible.length === 0 && finiteAll.length === 0) {
    return [cutoff, Math.max(cutoff + 0.05, 1)];
  }
  const sortedAll = [...(finiteAll.length ? finiteAll : finiteVisible)].sort(
    (a, b) => a - b,
  );
  const high = Math.max(
    cutoff + 1e-6,
    ...finiteVisible,
    percentile(sortedAll, 0.98),
    sortedAll[sortedAll.length - 1] ?? cutoff,
  );
  return [cutoff, high];
}
