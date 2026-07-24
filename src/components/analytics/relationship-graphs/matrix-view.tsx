"use client";

import { hierarchy } from "d3-hierarchy";
import { scaleSequential } from "d3-scale";
import { interpolateYlGnBu } from "d3-scale-chromatic";
import { useMemo, useState } from "react";

import {
  GraphEmptyState,
  LabsControls,
} from "@/components/analytics/relationship-graphs/graphs-controls";
import { useNormalizedThreshold } from "@/components/analytics/relationship-graphs/use-normalized-threshold";
import {
  colorDomainFromVisibleWeights,
  edgeWeight,
  formatScaleCaption,
  LAB_DEFAULT_NORMALIZED,
  undirectedWeightScale,
  type RelationshipGraphData,
  type UndirectedMetric,
  type UndirectedRelationshipEdge,
} from "@/lib/relationship-graph-shared";

type ClusterLeaf = { name: string; id: string };
type ClusterBranch = { children: Array<ClusterLeaf | ClusterBranch> };

function similarityMap(
  edges: UndirectedRelationshipEdge[],
  metric: UndirectedMetric,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const edge of edges) {
    const weight = edgeWeight(edge, metric);
    if (weight == null) continue;
    map.set(`${edge.source}:${edge.target}`, weight);
    map.set(`${edge.target}:${edge.source}`, weight);
  }
  return map;
}

function pairSim(
  map: Map<string, number>,
  left: string,
  right: string,
): number | null {
  if (left === right) return null;
  return map.has(`${left}:${right}`) ? (map.get(`${left}:${right}`) ?? null) : null;
}

/** Average-linkage agglomerative clustering → d3 hierarchy leaf order. */
function clusteredOrder(
  ids: string[],
  sim: Map<string, number>,
): string[] {
  if (ids.length <= 1) return ids;

  type Item = { ids: string[]; tree: ClusterLeaf | ClusterBranch };
  const items: Item[] = ids.map((id) => ({
    ids: [id],
    tree: { id, name: id },
  }));

  while (items.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestScore = -Infinity;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        let total = 0;
        let count = 0;
        for (const left of items[i].ids) {
          for (const right of items[j].ids) {
            total += pairSim(sim, left, right) ?? 0;
            count += 1;
          }
        }
        const score = count ? total / count : 0;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const left = items[bestI];
    const right = items[bestJ];
    const merged: Item = {
      ids: [...left.ids, ...right.ids],
      tree: { children: [left.tree, right.tree] },
    };
    items.splice(bestJ, 1);
    items.splice(bestI, 1);
    items.push(merged);
  }

  const root = hierarchy(items[0].tree);
  return root.leaves().map((leaf) => (leaf.data as ClusterLeaf).id);
}

export function MatrixView({ graph }: { graph: RelationshipGraphData }) {
  const [metric, setMetric] = useState<UndirectedMetric>("alignment");
  const [hover, setHover] = useState<{
    col: number;
    row: number;
    value: number | null;
    diagonal: boolean;
    x: number;
    y: number;
  } | null>(null);

  const scale = useMemo(
    () => undirectedWeightScale(graph.undirectedEdges, metric),
    [graph.undirectedEdges, metric],
  );
  const scaleKey = `matrix:${metric}:${scale.low.toFixed(4)}:${scale.high.toFixed(4)}:${scale.sampleSize}`;
  const { normalized, rawThreshold, setNormalized } = useNormalizedThreshold(
    scale,
    scaleKey,
    LAB_DEFAULT_NORMALIZED.matrix,
  );

  const { color, labels, matrix, order, visibleCount, domain } = useMemo(() => {
    const sim = similarityMap(graph.undirectedEdges, metric);
    const orderIds = clusteredOrder(
      graph.nodes.map((node) => node.id),
      sim,
    );
    const nameById = new Map(graph.nodes.map((node) => [node.id, node.name]));
    const labels = orderIds.map((id) => nameById.get(id) ?? id);
    const allWeights: number[] = [];
    const visibleWeights: number[] = [];
    const matrix = orderIds.map((rowId) =>
      orderIds.map((colId) => {
        if (rowId === colId) return { diagonal: true as const, value: null };
        const value = pairSim(sim, rowId, colId);
        if (value == null) {
          return { diagonal: false as const, value: null };
        }
        allWeights.push(value);
        if (value < rawThreshold) {
          return { diagonal: false as const, value: null };
        }
        visibleWeights.push(value);
        return { diagonal: false as const, value };
      }),
    );
    // Rescale: cutoff is the cool end; high end reaches strong observed values.
    const domain = colorDomainFromVisibleWeights(
      visibleWeights,
      rawThreshold,
      allWeights,
    );
    const color = scaleSequential(interpolateYlGnBu).domain(domain);
    return {
      color,
      domain,
      labels,
      matrix,
      order: orderIds,
      visibleCount: visibleWeights.length,
    };
  }, [graph.nodes, graph.undirectedEdges, metric, rawThreshold]);

  if (graph.nodes.length === 0) {
    return <GraphEmptyState message="No players to build an affinity matrix." />;
  }

  const cell = Math.max(18, Math.min(34, Math.floor(640 / order.length)));
  const hoverLabel =
    hover == null
      ? null
      : hover.diagonal
        ? `${labels[hover.row]} (self)`
        : hover.value == null
          ? `${labels[hover.row]} × ${labels[hover.col]}: no value`
          : `${labels[hover.row]} × ${labels[hover.col]}: ${(hover.value * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <LabsControls
        metric={metric}
        onMetricChange={setMetric}
        onThresholdChange={setNormalized}
        rawThreshold={rawThreshold}
        scaleCaption={formatScaleCaption(scale)}
        threshold={normalized}
        thresholdLabel="Hide below strength"
      />
      <p className="text-xs text-zinc-500">
        Color domain rescales with the hide cutoff: coolest = cutoff (
        {(domain[0] * 100).toFixed(1)}%), hottest ≈ strong pairs (
        {(domain[1] * 100).toFixed(1)}%). {visibleCount} visible cells. Hover a
        cell for pair details.
      </p>
      <div className="relative overflow-auto rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-4">
        {hoverLabel && hover ? (
          <div
            className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-white/15 bg-zinc-950/75 px-2.5 py-1.5 text-xs text-zinc-100 shadow-lg backdrop-blur-sm"
            style={{
              left: hover.x + 12,
              top: hover.y + 12,
            }}
          >
            {hoverLabel}
          </div>
        ) : null}
        <div
          className="inline-grid gap-px"
          style={{
            gridTemplateColumns: `${Math.max(84, cell * 3)}px repeat(${order.length}, ${cell}px)`,
          }}
        >
          <div />
          {labels.map((label) => (
            <div
              className="truncate px-0.5 text-[10px] text-zinc-400"
              key={`col-${label}`}
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                height: Math.max(84, cell * 3),
              }}
              title={label}
            >
              {label}
            </div>
          ))}
          {matrix.map((row, rowIndex) => (
            <div className="contents" key={order[rowIndex]}>
              <div
                className="truncate pr-2 text-right text-[10px] text-zinc-400"
                style={{ lineHeight: `${cell}px` }}
                title={labels[rowIndex]}
              >
                {labels[rowIndex]}
              </div>
              {row.map((cellValue, colIndex) => {
                const isDiagonal = cellValue.diagonal;
                const value = cellValue.value;
                return (
                  <div
                    className="rounded-[3px] transition-[outline] duration-75"
                    key={`${order[rowIndex]}-${order[colIndex]}`}
                    onMouseEnter={(event) =>
                      setHover({
                        col: colIndex,
                        diagonal: isDiagonal,
                        row: rowIndex,
                        value,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    onMouseMove={(event) =>
                      setHover((current) =>
                        current &&
                        current.row === rowIndex &&
                        current.col === colIndex
                          ? {
                              ...current,
                              x: event.clientX,
                              y: event.clientY,
                            }
                          : current,
                      )
                    }
                    style={{
                      width: cell,
                      height: cell,
                      outline:
                        hover?.row === rowIndex && hover?.col === colIndex
                          ? "1px solid rgba(250,250,250,0.7)"
                          : undefined,
                      outlineOffset: 0,
                      backgroundColor: isDiagonal
                        ? "rgba(113, 113, 122, 0.55)"
                        : value == null
                          ? "rgba(255,255,255,0.025)"
                          : color(value),
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
