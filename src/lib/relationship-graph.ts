import { cacheLife, cacheTag } from "next/cache";

import {
  analyticsScopeKey,
  encodeScopeIds,
  getRelationshipsTableData,
  type AnalyticsFilter,
  type RelationshipTableRow,
} from "@/lib/analytics";
import type {
  DirectedRelationshipEdge,
  RelationshipGraphData,
  RelationshipGraphNode,
  UndirectedRelationshipEdge,
} from "@/lib/relationship-graph-shared";

export type {
  DirectedRelationshipEdge,
  RelationshipGraphData,
  RelationshipGraphNode,
  UndirectedMetric,
  UndirectedRelationshipEdge,
} from "@/lib/relationship-graph-shared";
export {
  edgeWeight,
  filterDirectedEdges,
  filterUndirectedEdges,
} from "@/lib/relationship-graph-shared";

const ANALYTICS_CACHE_TAG = "analytics";

function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
}

function addNode(
  nodes: Map<string, RelationshipGraphNode>,
  id: string,
  name: string,
) {
  if (!nodes.has(id)) nodes.set(id, { id, name });
}

function shapeGraphData(
  alignmentRows: RelationshipTableRow[],
  mutualRows: RelationshipTableRow[],
  givenRows: RelationshipTableRow[],
): RelationshipGraphData {
  const nodes = new Map<string, RelationshipGraphNode>();
  const undirected = new Map<string, UndirectedRelationshipEdge>();

  for (const row of alignmentRows) {
    if (!row.rightId) continue;
    addNode(nodes, row.leftId, row.leftName);
    addNode(nodes, row.rightId, row.rightName ?? row.rightId);
    const key = pairKey(row.leftId, row.rightId);
    const existing = undirected.get(key);
    undirected.set(key, {
      source: row.leftId < row.rightId ? row.leftId : row.rightId,
      target: row.leftId < row.rightId ? row.rightId : row.leftId,
      sourceName:
        row.leftId < row.rightId ? row.leftName : (row.rightName ?? row.rightId),
      targetName:
        row.leftId < row.rightId ? (row.rightName ?? row.rightId) : row.leftName,
      alignment: row.alignment,
      mutualShare: existing?.mutualShare ?? null,
      sharedRounds: row.sharedRounds ?? existing?.sharedRounds ?? null,
      comparableFeatures: row.comparableFeatures,
      mutualPoints: existing?.mutualPoints ?? null,
    });
  }

  for (const row of mutualRows) {
    if (!row.rightId) continue;
    addNode(nodes, row.leftId, row.leftName);
    addNode(nodes, row.rightId, row.rightName ?? row.rightId);
    const key = pairKey(row.leftId, row.rightId);
    const existing = undirected.get(key);
    undirected.set(key, {
      source: row.leftId < row.rightId ? row.leftId : row.rightId,
      target: row.leftId < row.rightId ? row.rightId : row.leftId,
      sourceName:
        row.leftId < row.rightId ? row.leftName : (row.rightName ?? row.rightId),
      targetName:
        row.leftId < row.rightId ? (row.rightName ?? row.rightId) : row.leftName,
      alignment: existing?.alignment ?? null,
      mutualShare: row.ballotPointShare,
      sharedRounds: row.sharedRounds ?? existing?.sharedRounds ?? null,
      comparableFeatures: existing?.comparableFeatures ?? null,
      mutualPoints: row.points,
    });
  }

  const directedEdges: DirectedRelationshipEdge[] = [];
  for (const row of givenRows) {
    if (!row.rightId || row.pointsPerOpportunity == null) continue;
    addNode(nodes, row.leftId, row.leftName);
    addNode(nodes, row.rightId, row.rightName ?? row.rightId);
    directedEdges.push({
      source: row.leftId,
      target: row.rightId,
      sourceName: row.leftName,
      targetName: row.rightName ?? row.rightId,
      pointsPerOpportunity: row.pointsPerOpportunity,
      points: row.points ?? 0,
      opportunities: row.opportunities ?? 0,
      positiveRate: row.positiveRate ?? 0,
      sharedRounds: row.sharedRounds ?? 0,
    });
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    undirectedEdges: [...undirected.values()],
    directedEdges,
  };
}

export async function getRelationshipGraphData(
  filter: AnalyticsFilter,
): Promise<RelationshipGraphData> {
  const scopeKey = analyticsScopeKey(filter.leagueIds);
  const [alignment, mutual, given] = await Promise.all([
    getRelationshipsTableData(filter, {
      direction: "desc",
      focusPlayerId: null,
      sort: "alignment",
      tab: "alignment",
    }),
    getRelationshipsTableData(filter, {
      direction: "desc",
      focusPlayerId: null,
      sort: "share",
      tab: "mutual",
    }),
    getRelationshipsTableData(filter, {
      direction: "desc",
      focusPlayerId: null,
      sort: "rate",
      tab: "given",
    }),
  ]);

  if (
    alignment.needsScopeMaterialization ||
    mutual.needsScopeMaterialization ||
    given.needsScopeMaterialization
  ) {
    return {
      directedEdges: [],
      needsScopeMaterialization: true,
      nodes: [],
      scopeKey,
      undirectedEdges: [],
    };
  }

  return shapeGraphData(alignment.rows, mutual.rows, given.rows);
}

export async function getCachedRelationshipGraphData(
  leagueKey: string,
  roundKey: string,
): Promise<RelationshipGraphData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  const leagueIds = leagueKey ? leagueKey.split(",").filter(Boolean) : [];
  const roundIds = roundKey ? roundKey.split(",").filter(Boolean) : [];
  return getRelationshipGraphData({ leagueIds, roundIds });
}

export function relationshipGraphCacheKeys(filter: AnalyticsFilter): {
  leagueKey: string;
  roundKey: string;
} {
  return {
    leagueKey: encodeScopeIds(filter.leagueIds),
    roundKey: encodeScopeIds(filter.roundIds),
  };
}
