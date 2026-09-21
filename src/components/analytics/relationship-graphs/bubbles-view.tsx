"use client";

import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { connectedComponents } from "graphology-components";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  bubbleWeightScale,
  edgeWeight,
  filterUndirectedEdges,
  formatScaleCaption,
  type RelationshipGraphData,
} from "@/lib/relationship-graph-shared";
import { bubbleFallbacks } from "@/lib/bubble-fallbacks";

const PALETTE = [
  "#bef264",
  "#7dd3fc",
  "#f9a8d4",
  "#fdba74",
  "#c4b5fd",
  "#67e8f9",
  "#fde68a",
  "#86efac",
];

export function BubblesView({ graph }: { graph: RelationshipGraphData }) {
  const [mode, setMode] = useState<"louvain" | "components">("louvain");
  const [keepEveryone, setKeepEveryone] = useState(true);
  const scale = useMemo(
    () => bubbleWeightScale(graph.undirectedEdges),
    [graph.undirectedEdges],
  );
  const scaleKey = `bubbles:${graph.scopeKey}:${scale.sorted.join(",")}`;
  const { normalized, rawThreshold, setNormalized, unfiltered, setUnfiltered } = useNormalizedThreshold(
    scale,
    scaleKey,
  );

  const { links, nodes, summary, primaryCount, fallbackCount, ungroupedCount } = useMemo(() => {
    const filtered = filterUndirectedEdges(
      graph.undirectedEdges,
      "alignment",
      rawThreshold,
    );
    const coreIds = new Set<string>();
    for (const edge of filtered) {
      coreIds.add(edge.source);
      coreIds.add(edge.target);
    }

    const g = new Graph({ type: "undirected" });
    for (const node of graph.nodes) {
      if (coreIds.has(node.id)) {
        g.addNode(node.id, { name: node.name });
      }
    }
    for (const edge of filtered) {
      if (!g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, {
          weight: edge.alignment ?? 0,
        });
      }
    }

    let assignment: Record<string, number> = {};
    if (mode === "louvain" && filtered.some(edge => (edge.alignment ?? 0) > 0)) {
      assignment = louvain(g, { getEdgeWeight: "weight", randomWalk: false }) as Record<
        string,
        number
      >;
    } else {
      const components = connectedComponents(g);
      components.forEach((component, index) => {
        for (const nodeId of component) assignment[nodeId] = index;
      });
    }

    const coreByCommunity = new Map<number, string[]>();
    for (const nodeId of coreIds) {
      const community = assignment[nodeId];
      if (community == null) continue;
      const list = coreByCommunity.get(community) ?? [];
      list.push(nodeId);
      coreByCommunity.set(community, list);
    }

    const strengthById = new Map<string, number>();
    for (const nodeId of coreIds) {
      const community = assignment[nodeId];
      if (community == null) continue;
      const mates = coreByCommunity.get(community) ?? [];
      let maxWithin = 0;
      for (const edge of filtered) {
        const other =
          edge.source === nodeId
            ? edge.target
            : edge.target === nodeId
              ? edge.source
              : null;
        if (other == null || !mates.includes(other)) continue;
        maxWithin = Math.max(maxWithin, edge.alignment ?? 0);
      }
      strengthById.set(nodeId, maxWithin);
    }
    const allStrengths = [...strengthById.values()];
    const maxStrength = Math.max(...allStrengths, 0.0001);

    const fallback = keepEveryone
      ? bubbleFallbacks(graph.undirectedEdges, rawThreshold, assignment)
      : { assignment, links: [] };
    const displayAssignment = fallback.assignment;
    const visibleIds = new Set([...coreIds, ...fallback.links.flatMap(edge => [edge.source, edge.target])]);

    const communityMembers = new Map<
      number,
      Array<{ id: string; name: string; strength: number; core: boolean }>
    >();
    for (const node of graph.nodes) {
      const community = displayAssignment[node.id];
      if (community == null) continue;
      const list = communityMembers.get(community) ?? [];
      list.push({
        id: node.id,
        name: node.name,
        strength: strengthById.get(node.id) ?? 0,
        core: coreIds.has(node.id),
      });
      communityMembers.set(community, list);
    }

    const summaryRows = [...communityMembers.entries()]
      .map(([id, members]) => {
        const sorted = [...members].sort((a, b) => {
          return Number(b.core) - Number(a.core) || b.strength - a.strength || a.name.localeCompare(b.name);
        });
        const coreOnly = sorted.filter(member => member.core);
        const pairWeights: number[] = [];
        for (let i = 0; i < coreOnly.length; i += 1) {
          for (let j = i + 1; j < coreOnly.length; j += 1) {
            const edge = filtered.find(
              (item) =>
                (item.source === coreOnly[i].id &&
                  item.target === coreOnly[j].id) ||
                (item.source === coreOnly[j].id &&
                  item.target === coreOnly[i].id),
            );
            if (edge?.alignment != null) pairWeights.push(edge.alignment);
          }
        }
        const avgAlignment =
          pairWeights.length > 0
            ? pairWeights.reduce((sum, value) => sum + value, 0) /
              pairWeights.length
            : null;
        return {
          avgAlignment,
          color: PALETTE[id % PALETTE.length],
          core: coreOnly.length,
          id,
          members: sorted,
          size: sorted.length,
        };
      })
      .filter((row) => row.size > 0)
      .sort((a, b) => b.core - a.core || b.size - a.size || a.id - b.id);

    const forceNodes: ForceNode[] = graph.nodes
      .filter((node) => visibleIds.has(node.id))
      .map((node) => {
        const community = displayAssignment[node.id];
        const strength = strengthById.get(node.id) ?? 0;
        const t = strength / maxStrength;
        return {
          color: community == null ? "#a1a1aa" : PALETTE[community % PALETTE.length],
          id: node.id,
          name: node.name,
          val: coreIds.has(node.id) ? 0.9 + t * t * 2.1 : 0.65,
        };
      });

    const forceLinks: ForceLink[] = [
      ...filtered.map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: edgeWeight(edge, "alignment") ?? 0,
        label: `${edge.sourceName} ↔ ${edge.targetName}: ${((edge.alignment ?? 0) * 100).toFixed(1)}% alignment`,
      })),
      ...fallback.links.map(edge => ({
        source: edge.source,
        target: edge.target,
        weight: edge.alignment ?? 0,
        fallback: true,
        color: "rgba(161, 161, 170, 0.55)",
        label: `${edge.sourceName} ↔ ${edge.targetName}: ${((edge.alignment ?? 0) * 100).toFixed(1)}% alignment (below cutoff)`,
      })),
    ];

    return {
      primaryCount: filtered.length,
      fallbackCount: fallback.links.length,
      ungroupedCount: forceNodes.filter(node => displayAssignment[node.id] == null).length,
      links: forceLinks,
      nodes: forceNodes,
      summary: summaryRows,
    };
  }, [graph.nodes, graph.undirectedEdges, keepEveryone, mode, rawThreshold]);

  return (
    <div className="space-y-4">
      <LabsControls
        densityScale
        unfiltered={unfiltered}
        onUnfilteredChange={setUnfiltered}
        belowThreshold={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input checked={keepEveryone} className="size-3.5 accent-lime-300" onChange={event => setKeepEveryone(event.target.checked)} type="checkbox" />
            <span>Include fallback links below cutoff</span>
          </label>
        }
        onThresholdChange={setNormalized}
        rawThreshold={rawThreshold}
        scaleCaption={formatScaleCaption(scale)}
        showMetric={false}
        threshold={normalized}
        thresholdLabel="Bubble sensitivity"
      >
        <label className="space-y-1.5 text-xs text-zinc-400">
          <span className="block">Detection</span>
          <select
            className="h-9 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
            onChange={(event) =>
              setMode(event.target.value as "louvain" | "components")
            }
            value={mode}
          >
            <option value="louvain">Louvain communities</option>
            <option value="components">Connected components</option>
          </select>
        </label>
      </LabsControls>
      <p className="text-xs text-zinc-500">
        Only links meeting the cutoff define bubbles. At 50%, the connection budget targets 1.25 qualifying links per player on average; equal scores stay together.
        {keepEveryone
          ? " Smaller nodes follow their strongest available path to a bubble and share its color; gray fallback links do not affect the core groups."
          : " Players without qualifying links are hidden."}
        {` ${summary.length} groups · ${primaryCount} above cutoff · ${fallbackCount} fallback · ${nodes.length} players.`}
        {ungroupedCount > 0 ? ` ${ungroupedCount} players have no path to a core bubble and stay gray.` : ""}
      </p>
      {nodes.length === 0 ? (
        <GraphEmptyState message="No alignment structure at this sensitivity." />
      ) : (
        <RelationshipForceGraph
          layout={{
            chargeStrength: -150,
            collideRadius: 20,
            height: 580,
            labelMinPx: 12,
            linkDistance: 78,
            nodeBaseRadius: 7,
            useDarkLinks: true,
          }}
          links={links}
          nodes={nodes}
        />
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <CardTitle>Bubble {group.id + 1}</CardTitle>
              </div>
              <CardDescription>
                {group.core} core
                {group.size > group.core ? ` · ${group.size - group.core} fallback` : ""}
                {group.avgAlignment != null
                  ? ` · core avg ${(group.avgAlignment * 100).toFixed(0)}%`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-zinc-300">
                {group.members.map((member) => (
                  <li
                    key={member.id}
                  >
                    {member.name}
                    {!member.core ? <span className="ml-2 text-xs text-zinc-500"> fallback</span> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
