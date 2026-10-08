"use client";

import { useMemo } from "react";
import { useGraphSetting, graphBoolean } from "./use-graph-setting";

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
  const [keepEveryone, setKeepEveryone] = useGraphSetting("fallback", true, graphBoolean);
  const scale = useMemo(
    () => directedWeightScale(graph.directedEdges),
    [graph.directedEdges],
  );
  const scaleKey = `flow:${graph.scopeKey}:${scale.sorted.join(",")}`;
  const { normalized, rawThreshold, setNormalized, unfiltered, setUnfiltered } = useNormalizedThreshold(
    scale,
    scaleKey,
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

    const softLinks = soft.map((edge) => ({
      fallback: true,
      color: "rgba(161, 161, 170, 0.55)",
      curvature: 0.1,
      label: `${edge.sourceName} → ${edge.targetName}: ${edge.pointsPerOpportunity.toFixed(2)} pts/opp (below cutoff)`,
      source: edge.source,
      target: edge.target,
      weight: edge.pointsPerOpportunity,
    }));

    return [...primaryLinks, ...softLinks];
  }, [primary, rawThreshold, soft]);

  return (
    <div className="space-y-4">
      <LabsControls
        densityScale
        unfiltered={unfiltered}
        onUnfilteredChange={setUnfiltered}
        belowThreshold={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              checked={keepEveryone}
              className="size-3.5 accent-lime-300"
              onChange={(event) => setKeepEveryone(event.target.checked)}
              type="checkbox"
            />
            <span>Include fallback links below cutoff</span>
          </label>
        }
        onThresholdChange={setNormalized}
        rawFormat="absolute"
        rawThreshold={rawThreshold}
        rawUnit="pts/opp"
        scaleCaption={formatScaleCaption(scale, "absolute", "pts/opp")}
        showMetric={false}
        threshold={normalized}
        thresholdLabel="Flow sensitivity"
      />
      <p className="text-xs text-zinc-400"><span className="text-orange-300">Orange: one-way</span> · <span className="text-sky-300">Blue: reciprocal</span> · Gray: below cutoff. {pairKeys.size} pairs, {nodes.length} players.</p>
      {links.length === 0 ? (
        <GraphEmptyState message="No directed edges above this threshold." />
      ) : (
        <RelationshipForceGraph
          directed
          pointTotals={Object.fromEntries(graph.nodes.map(node => [node.id, {incoming:graph.directedEdges.filter(edge=>edge.target===node.id).reduce((sum,edge)=>sum+edge.points,0),outgoing:graph.directedEdges.filter(edge=>edge.source===node.id).reduce((sum,edge)=>sum+edge.points,0)}]))}
          layout={{
            chargeStrength: -280,
            collideRadius: 26,
            fitPadding: 40,
            fitScale: 0.95,
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
