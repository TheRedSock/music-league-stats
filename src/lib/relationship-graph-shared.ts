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

/**
 * Per-view default slider positions within the robust typical band.
 * These are dataset-relative (% of P10–P95-ish range), not absolute metric
 * cutoffs — so a similar filtering intensity applies across leagues/scopes.
 */
export const LAB_DEFAULT_NORMALIZED = {
  bubbles: 0.9,
  ego: 0.3,
  flow: 0.85,
  matrix: 0,
} as const;

/** Maps a 0–1 slider onto a robust (outlier-resistant) band of raw weights. */
export type WeightScale = {
  /** Robust lower bound (≈P10, with fallbacks). */
  low: number;
  /** Robust upper bound (≈P90, with fallbacks). */
  high: number;
  /** Suggested slider position in [0, 1]. */
  defaultNormalized: number;
  sampleSize: number;
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
  return sortedAscending[lower] * (1 - t) + sortedAscending[upper] * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Build a slider scale from observed weights using percentile bounds so a few
 * tiny/huge outliers do not collapse the useful range. Prefer P10–P90; widen to
 * P5–P95 or IQR fences only when needed.
 */
export function buildWeightScale(weights: readonly number[]): WeightScale {
  const finite = weights.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { defaultNormalized: 0.7, high: 1, low: 0, sampleSize: 0 };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.1);
  const p90 = percentile(sorted, 0.9);
  const p5 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);
  const p98 = percentile(sorted, 0.98);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;

  let low = p10;
  // Prefer a high bound that still leaves headroom for strong pairs (not only P90).
  let high = Math.max(p90, p95);

  // Too tight (common when most mutual shares cluster near 0): widen.
  if (high - low < Math.max(1e-4, Math.abs(high) * 0.05)) {
    low = p5;
    high = Math.max(p95, p98);
  }
  if (high - low < Math.max(1e-4, Math.abs(high) * 0.05) && iqr > 0) {
    low = Math.max(sorted[0], q1 - 1.5 * iqr);
    high = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);
  }
  if (high - low < 1e-6) {
    const mid = percentile(sorted, 0.5);
    const pad = Math.max(0.02, Math.abs(mid) * 0.15 || 0.02);
    low = mid - pad;
    high = mid + pad;
  }

  // Default toward the filtered end (~P72 of samples) to avoid hairballs.
  const filteredTarget = percentile(sorted, 0.72);
  const defaultNormalized = clamp01((filteredTarget - low) / (high - low));

  return {
    defaultNormalized: clamp01(Math.max(0.58, Math.min(0.82, defaultNormalized))),
    high,
    low,
    sampleSize: sorted.length,
  };
}

export function undirectedWeightScale(
  edges: readonly UndirectedRelationshipEdge[],
  metric: UndirectedMetric,
): WeightScale {
  const weights: number[] = [];
  for (const edge of edges) {
    const weight = edgeWeight(edge, metric);
    if (weight != null) weights.push(weight);
  }
  return buildWeightScale(weights);
}

export function directedWeightScale(
  edges: readonly DirectedRelationshipEdge[],
): WeightScale {
  return buildWeightScale(edges.map((edge) => edge.pointsPerOpportunity));
}

export function normalizedToRaw(
  normalized: number,
  scale: WeightScale,
): number {
  return scale.low + clamp01(normalized) * (scale.high - scale.low);
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
  return `typical ${formatWeightValue(scale.low, format)}–${formatWeightValue(scale.high, format)}${suffix}`;
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
