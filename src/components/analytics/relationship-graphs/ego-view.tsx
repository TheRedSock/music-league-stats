"use client";

import { useMemo, useState } from "react";

import {
  FocusPlayerSelect,
  GraphEmptyState,
  LabsControls,
} from "@/components/analytics/relationship-graphs/graphs-controls";
import {
  RelationshipForceGraph,
  type ForceLink,
  type ForceNode,
} from "@/components/analytics/relationship-graphs/force-graph-canvas";
import { useNormalizedThreshold } from "@/components/analytics/relationship-graphs/use-normalized-threshold";
import {
  edgeWeight,
  formatScaleCaption,
  LAB_DEFAULT_NORMALIZED,
  undirectedWeightScale,
  type RelationshipGraphData,
  type UndirectedMetric,
} from "@/lib/relationship-graph-shared";

export function EgoView({ graph }: { graph: RelationshipGraphData }) {
  const [metric, setMetric] = useState<UndirectedMetric>("alignment");
  const [focusId, setFocusId] = useState(graph.nodes[0]?.id ?? "");
  // Derive a valid focus when the graph changes — avoid syncing via effect.
  const resolvedFocusId = graph.nodes.some((node) => node.id === focusId)
    ? focusId
    : (graph.nodes[0]?.id ?? "");

  const focusEdges = useMemo(() => {
    if (!resolvedFocusId) return [];
    return graph.undirectedEdges.filter(
      (edge) =>
        edge.source === resolvedFocusId || edge.target === resolvedFocusId,
    );
  }, [resolvedFocusId, graph.undirectedEdges]);

  const scale = useMemo(
    () => undirectedWeightScale(focusEdges, metric),
    [focusEdges, metric],
  );
  const scaleKey = `ego:${resolvedFocusId}:${metric}:${scale.low.toFixed(4)}:${scale.high.toFixed(4)}:${scale.sampleSize}`;
  const { normalized, rawThreshold, setNormalized } = useNormalizedThreshold(
    scale,
    scaleKey,
    LAB_DEFAULT_NORMALIZED.ego,
  );

  const neighborEdges = useMemo(() => {
    if (!resolvedFocusId) return [];
    return focusEdges
      .map((edge) => ({
        edge,
        weight: edgeWeight(edge, metric),
      }))
      .filter(
        (item): item is { edge: (typeof focusEdges)[number]; weight: number } =>
          item.weight != null && item.weight >= rawThreshold,
      )
      .sort((a, b) => b.weight - a.weight);
  }, [focusEdges, resolvedFocusId, metric, rawThreshold]);

  const maxNeighborWeight = Math.max(
    ...neighborEdges.map((item) => item.weight),
    0.0001,
  );
  const minNeighborWeight = Math.min(
    ...neighborEdges.map((item) => item.weight),
    maxNeighborWeight,
  );

  const nodes: ForceNode[] = useMemo(() => {
    if (!resolvedFocusId) return [];
    const focus = graph.nodes.find((node) => node.id === resolvedFocusId);
    if (!focus) return [];
    const weightByNeighbor = new Map<string, number>();
    for (const { edge, weight } of neighborEdges) {
      const other =
        edge.source === resolvedFocusId ? edge.target : edge.source;
      weightByNeighbor.set(other, weight);
    }
    const span = Math.max(maxNeighborWeight - minNeighborWeight, 1e-6);
    return [
      { id: focus.id, name: focus.name, val: 3.4, fx: 0, fy: 0 },
      ...graph.nodes
        .filter((node) => weightByNeighbor.has(node.id))
        .map((node) => {
          const weight = weightByNeighbor.get(node.id) ?? 0;
          // Normalize across visible neighbors so weak↔strong use the full range.
          const t = (weight - minNeighborWeight) / span;
          // ~0.85 … ~2.55 — readable weak nodes, stronger top end (squared ease).
          return {
            id: node.id,
            name: node.name,
            val: 0.85 + t * t * 1.7,
          };
        }),
    ];
  }, [
    resolvedFocusId,
    graph.nodes,
    maxNeighborWeight,
    minNeighborWeight,
    neighborEdges,
  ]);

  const links: ForceLink[] = useMemo(
    () =>
      neighborEdges.map(({ edge, weight }) => ({
        source: edge.source,
        target: edge.target,
        weight,
      })),
    [neighborEdges],
  );

  if (graph.nodes.length === 0) {
    return (
      <GraphEmptyState message="No players in this scope for an ego network." />
    );
  }

  return (
    <div className="space-y-4">
      <LabsControls
        metric={metric}
        onMetricChange={setMetric}
        onThresholdChange={setNormalized}
        rawThreshold={rawThreshold}
        scaleCaption={formatScaleCaption(scale)}
        threshold={normalized}
        thresholdLabel="Min neighbor strength"
      >
        <FocusPlayerSelect
          nodes={graph.nodes}
          onChange={setFocusId}
          value={resolvedFocusId}
        />
      </LabsControls>
      <p className="text-xs text-zinc-500">
        Ego fixed at center (large). All neighbors above the strength cutoff are
        shown; node size scales strongly with {metric} (
        {links.length} connection{links.length === 1 ? "" : "s"}).
      </p>
      {links.length === 0 ? (
        <GraphEmptyState message="No neighbors above this threshold for the focused player." />
      ) : (
        <RelationshipForceGraph
          highlightId={resolvedFocusId}
          layout={{
            chargeStrength: -200,
            collideRadius: 22,
            height: 580,
            labelMinPx: 12,
            linkDistance: 120,
            nodeBaseRadius: 6,
            useDarkLinks: true,
          }}
          links={links}
          nodes={nodes}
        />
      )}
    </div>
  );
}
