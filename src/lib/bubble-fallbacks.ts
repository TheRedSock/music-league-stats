import { edgeWeight, type UndirectedMetric, type UndirectedRelationshipEdge } from "./relationship-graph-shared";

/** Maximum-strength fallback forest, rooted in the already-detected bubbles.
 * A fallback can join a bubble via another fallback, but cannot merge bubbles
 * or change core membership. Components with no path to a core stay ungrouped.
 */
export function bubbleFallbacks(
  edges: readonly UndirectedRelationshipEdge[],
  cutoff: number,
  coreAssignment: Readonly<Record<string, number>>,
  metric: UndirectedMetric = "alignment",
) {
  const parent = new Map<string, string>();
  const group = new Map<string, number>();
  const seeds = new Map<number, string>();
  function root(id: string): string {
    const next = parent.get(id);
    if (next == null) { parent.set(id, id); return id; }
    if (next === id) return id;
    const result = root(next);
    parent.set(id, result);
    return result;
  }
  for (const [id, community] of Object.entries(coreAssignment)) {
    const seed = seeds.get(community) ?? id;
    seeds.set(community, seed);
    parent.set(id, seed);
    group.set(seed, community);
  }
  const candidates = edges.filter(edge => {const weight=edgeWeight(edge,metric);return weight != null && Number.isFinite(weight) && weight > 0 && weight < cutoff;})
    .sort((a, b) => edgeWeight(b,metric)! - edgeWeight(a,metric)! || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const links: UndirectedRelationshipEdge[] = [];
  for (const edge of candidates) {
    const a = root(edge.source);
    const b = root(edge.target);
    if (a === b || (group.has(a) && group.has(b))) continue;
    // Keep a seeded root when joining an unassigned component to a bubble.
    if (group.has(b)) parent.set(a, b);
    else parent.set(b, a);
    links.push(edge);
  }
  const assignment: Record<string, number> = { ...coreAssignment };
  for (const id of parent.keys()) {
    const community = group.get(root(id));
    if (community != null) assignment[id] = community;
  }
  return { assignment, links };
}
