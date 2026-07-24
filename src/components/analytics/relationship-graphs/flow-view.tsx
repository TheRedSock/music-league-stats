"use client";

import { useMemo, useState } from "react";

import {
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
  directedWeightScale,
  filterDirectedEdges,
  formatScaleCaption,
  LAB_DEFAULT_NORMALIZED,
  type DirectedRelationshipEdge,
  type RelationshipGraphData,
} from "@/lib/relationship-graph-shared";

function edgeKey(edge: Pick<DirectedRelationshipEdge, "source" | "target">) {
  return `${edge.source}->${edge.target}`;
}

/** Strongest edge involving player that sits below the cutoff (closest from below). */
function bestBelowCutoff(
  playerId: string,
  edges: readonly DirectedRelationshipEdge[],
  cutoff: number,
): DirectedRelationshipEdge | null {
  let best: DirectedRelationshipEdge | null = null;
  for (const edge of edges) {
    if (edge.source !== playerId && edge.target !== playerId) continue;
    if (edge.pointsPerOpportunity >= cutoff) continue;
    if (
      !best ||
      edge.pointsPerOpportunity > best.pointsPerOpportunity
    ) {
      best = edge;
    }
  }
  return best;
}

export function FlowView({ graph }: { graph: RelationshipGraphData }) {
  const [keepEveryone, setKeepEveryone] = useState(true);
  const scale = useMemo(
    () => directedWeightScale(graph.directedEdges),
    [graph.directedEdges],
  );
  const scaleKey = `flow:${scale.low.toFixed(4)}:${scale.high.toFixed(4)}:${scale.sampleSize}`;
  const { normalized, rawThreshold, setNormalized } = useNormalizedThreshold(
    scale,
    scaleKey,
    LAB_DEFAULT_NORMALIZED.flow,
  );

  const { primary, soft, activeIds } = useMemo(() => {
    const primary = filterDirectedEdges(graph.directedEdges, rawThreshold);
    const present = new Set<string>();
    const primaryKeys = new Set<string>();
    for (const edge of primary) {
      present.add(edge.source);
      present.add(edge.target);
      primaryKeys.add(edgeKey(edge));
    }

    const soft: DirectedRelationshipEdge[] = [];
    if (keepEveryone) {
      for (const node of graph.nodes) {
        if (present.has(node.id)) continue;
        const best = bestBelowCutoff(
          node.id,
          graph.directedEdges,
          rawThreshold,
        );
        if (!best) continue;
        const key = edgeKey(best);
        if (primaryKeys.has(key)) continue;
        if (soft.some((edge) => edgeKey(edge) === key)) {
          present.add(node.id);
          continue;
        }
        soft.push(best);
        present.add(best.source);
        present.add(best.target);
      }
    }

    return { activeIds: present, primary, soft };
  }, [graph.directedEdges, graph.nodes, keepEveryone, rawThreshold]);

  const nodes: ForceNode[] = useMemo(
    () =>
      graph.nodes
        .filter((node) => activeIds.has(node.id))
        .map((node) => ({ id: node.id, name: node.name, val: 1.6 })),
    [activeIds, graph.nodes],
  );

  const pairKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const edge of [...primary, ...soft]) {
      const a = edge.source < edge.target ? edge.source : edge.target;
      const b = edge.source < edge.target ? edge.target : edge.source;
      keys.add(`${a}:${b}`);
    }
    return keys;
  }, [primary, soft]);

  const links: ForceLink[] = useMemo(() => {
    const max = Math.max(
      rawThreshold,
      ...primary.map((edge) => edge.pointsPerOpportunity),
      0.0001,
    );

    const primaryLinks = primary.map((edge) => {
      const reciprocal = primary.some(
        (other) =>
          other.source === edge.target && other.target === edge.source,
      );
      const t = edge.pointsPerOpportunity / max;
      return {
        color: reciprocal
          ? `rgba(14, 165, 233, ${0.55 + t * 0.4})`
          : `rgba(234, 88, 12, ${0.55 + t * 0.4})`,
        curvature: reciprocal ? 0.25 : 0.12,
        label: `${edge.sourceName} → ${edge.targetName}: ${edge.pointsPerOpportunity.toFixed(2)} pts/opp`,
        source: edge.source,
        target: edge.target,
        weight: edge.pointsPerOpportunity,
      };
    });

    // Soft edges: thinner than a line at the cutoff (≈65% of cutoff visual weight).
    const softDisplayWeight = Math.max(rawThreshold * 0.65, 0.0001);
    const softLinks = soft.map((edge) => ({
      color: "rgba(161, 161, 170, 0.55)",
      curvature: 0.1,
      label: `${edge.sourceName} → ${edge.targetName}: ${edge.pointsPerOpportunity.toFixed(2)} pts/opp (near cutoff)`,
      source: edge.source,
      target: edge.target,
      weight: softDisplayWeight,
    }));

    return [...primaryLinks, ...softLinks];
  }, [primary, rawThreshold, soft]);

  return (
    <div className="space-y-4">
      <LabsControls
        belowThreshold={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              checked={keepEveryone}
              className="size-3.5 accent-lime-300"
              onChange={(event) => setKeepEveryone(event.target.checked)}
              type="checkbox"
            />
            <span>Keep everyone (near-cutoff edge)</span>
          </label>
        }
        onThresholdChange={setNormalized}
        rawFormat="absolute"
        rawThreshold={rawThreshold}
        rawUnit="pts/opp"
        scaleCaption={formatScaleCaption(scale, "absolute", "pts/opp")}
        showMetric={false}
        threshold={normalized}
        thresholdLabel="Min points/opportunity strength"
      />
      <p className="text-xs text-zinc-500">
        Arrows point giver → receiver (points given per opportunity).{" "}
        <span className="text-orange-300">Orange</span> is one-way above
        cutoff; <span className="text-sky-300">blue</span> is reciprocal.
        {keepEveryone ? (
          <>
            {" "}
            <span className="text-zinc-400">Gray</span> soft arrows are each
            missing player&apos;s strongest edge just below the cutoff
            (thinner).
          </>
        ) : null}{" "}
        {primary.length} above cutoff
        {soft.length > 0 ? ` · ${soft.length} soft` : ""} · {pairKeys.size}{" "}
        unique pairs · {nodes.length} players.
      </p>
      {links.length === 0 ? (
        <GraphEmptyState message="No directed edges above this threshold." />
      ) : (
        <RelationshipForceGraph
          directed
          layout={{
            chargeStrength: -280,
            collideRadius: 26,
            fitPadding: 96,
            fitScale: 0.82,
            height: 640,
            labelMinPx: 12,
            linkDistance: 150,
            nodeBaseRadius: 9,
            useDarkLinks: false,
          }}
          links={links}
          nodes={nodes}
        />
      )}
    </div>
  );
}
