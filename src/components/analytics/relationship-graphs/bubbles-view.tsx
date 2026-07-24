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
  edgeWeight,
  filterUndirectedEdges,
  formatScaleCaption,
  LAB_DEFAULT_NORMALIZED,
  undirectedWeightScale,
  type RelationshipGraphData,
  type UndirectedRelationshipEdge,
} from "@/lib/relationship-graph-shared";

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

type MemberKind = "core" | "attached";

function bestAlignmentToSet(
  playerId: string,
  memberIds: readonly string[],
  edges: readonly UndirectedRelationshipEdge[],
): { otherId: string; weight: number } | null {
  let best: { otherId: string; weight: number } | null = null;
  for (const edge of edges) {
    const weight = edge.alignment;
    if (weight == null) continue;
    let otherId: string | null = null;
    if (edge.source === playerId && memberIds.includes(edge.target)) {
      otherId = edge.target;
    } else if (edge.target === playerId && memberIds.includes(edge.source)) {
      otherId = edge.source;
    }
    if (otherId == null) continue;
    if (!best || weight > best.weight) best = { otherId, weight };
  }
  return best;
}

export function BubblesView({ graph }: { graph: RelationshipGraphData }) {
  const [mode, setMode] = useState<"louvain" | "components">("louvain");
  const scale = useMemo(
    () => undirectedWeightScale(graph.undirectedEdges, "alignment"),
    [graph.undirectedEdges],
  );
  const scaleKey = `bubbles:${scale.low.toFixed(4)}:${scale.high.toFixed(4)}:${scale.sampleSize}`;
  const { normalized, rawThreshold, setNormalized } = useNormalizedThreshold(
    scale,
    scaleKey,
    LAB_DEFAULT_NORMALIZED.bubbles,
  );

  const { communities, links, nodes, summary } = useMemo(() => {
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
    if (mode === "louvain" && g.size > 0) {
      assignment = louvain(g, { getEdgeWeight: "weight" }) as Record<
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

    // Attach everyone else to the bubble they align with most (any core member).
    const attachedTo = new Map<
      string,
      { community: number; otherId: string; weight: number }
    >();
    const coreMemberList = [...coreIds];
    for (const node of graph.nodes) {
      if (coreIds.has(node.id)) continue;
      const best = bestAlignmentToSet(
        node.id,
        coreMemberList,
        graph.undirectedEdges,
      );
      if (!best) continue;
      const community = assignment[best.otherId];
      if (community == null) continue;
      attachedTo.set(node.id, {
        community,
        otherId: best.otherId,
        weight: best.weight,
      });
      assignment[node.id] = community;
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
    for (const [nodeId, info] of attachedTo) {
      strengthById.set(nodeId, info.weight);
    }

    const allStrengths = [...strengthById.values()];
    const maxStrength = Math.max(...allStrengths, 0.0001);

    const communityMembers = new Map<
      number,
      Array<{ id: string; name: string; kind: MemberKind; strength: number }>
    >();
    for (const node of graph.nodes) {
      const community = assignment[node.id];
      if (community == null) continue;
      const kind: MemberKind = coreIds.has(node.id) ? "core" : "attached";
      const list = communityMembers.get(community) ?? [];
      list.push({
        id: node.id,
        kind,
        name: node.name,
        strength: strengthById.get(node.id) ?? 0,
      });
      communityMembers.set(community, list);
    }

    const summaryRows = [...communityMembers.entries()]
      .map(([id, members]) => {
        const sorted = [...members].sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
          return b.strength - a.strength || a.name.localeCompare(b.name);
        });
        const coreOnly = sorted.filter((member) => member.kind === "core");
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
          attached: sorted.filter((member) => member.kind === "attached").length,
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
      .filter((node) => assignment[node.id] != null)
      .map((node) => {
        const community = assignment[node.id]!;
        const strength = strengthById.get(node.id) ?? 0;
        const t = strength / maxStrength;
        const attached = attachedTo.has(node.id);
        return {
          color: PALETTE[community % PALETTE.length],
          id: node.id,
          name: node.name,
          // Core strong links large; attached / weak associations stay small.
          val: attached ? 0.45 + t * 0.85 : 0.9 + t * t * 2.1,
        };
      });

    const forceLinks: ForceLink[] = [
      ...filtered.map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: edgeWeight(edge, "alignment") ?? 0,
      })),
      // Soft spokes from attached players to their best bubble contact.
      ...[...attachedTo.entries()].map(([nodeId, info]) => ({
        color: "rgba(161, 161, 170, 0.35)",
        curvature: 0.08,
        source: nodeId,
        target: info.otherId,
        weight: Math.max(0.05, info.weight * 0.45),
      })),
    ];

    return {
      communities: assignment,
      links: forceLinks,
      nodes: forceNodes,
      summary: summaryRows,
    };
  }, [graph.nodes, graph.undirectedEdges, mode, rawThreshold]);

  return (
    <div className="space-y-4">
      <LabsControls
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
        Slider sets which edges define bubbles. Players below that cutoff stay
        on the canvas attached to their best-aligned bubble (smaller nodes /
        faint spokes). Node size scales with within-bubble strength.{" "}
        {Object.keys(communities).length
          ? `${summary.length} groups.`
          : "No groups yet."}
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
                {group.attached > 0 ? ` · ${group.attached} attached` : ""}
                {group.avgAlignment != null
                  ? ` · core avg ${(group.avgAlignment * 100).toFixed(0)}%`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-zinc-300">
                {group.members.map((member) => (
                  <li
                    className={
                      member.kind === "attached" ? "text-zinc-500" : undefined
                    }
                    key={member.id}
                  >
                    {member.name}
                    {member.kind === "attached" ? " · attached" : ""}
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
