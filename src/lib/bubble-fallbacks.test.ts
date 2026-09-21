import { describe, expect, it } from "vitest";
import { bubbleFallbacks } from "./bubble-fallbacks";
import type { UndirectedRelationshipEdge } from "./relationship-graph-shared";

function edge(source: string, target: string, alignment: number | null): UndirectedRelationshipEdge {
  return { source, target, sourceName: source, targetName: target, alignment, mutualShare: null, mutualPoints: null, sharedRounds: 4, comparableFeatures: 20 };
}

describe("bubble fallback attachments", () => {
  it("uses the strongest available paths without merging or changing core bubbles", () => {
    const core = { a: 0, b: 0, c: 1, d: 1 };
    const edges = [edge("x", "y", 0.8), edge("y", "a", 0.7), edge("x", "c", 0.6), edge("z", "d", 0.75), edge("z", "a", 0.65), edge("a", "c", 0.8), edge("a", "b", 0.95)];
    const result = bubbleFallbacks(edges, 0.9, core);
    expect(result.assignment).toEqual({ ...core, x: 0, y: 0, z: 1 });
    expect(result.links.map(e => `${e.source}-${e.target}`)).toEqual(["x-y", "z-d", "y-a"]);
    expect(core).toEqual({ a: 0, b: 0, c: 1, d: 1 });
    expect(bubbleFallbacks([...edges].reverse(), 0.9, core)).toEqual(result);
  });

  it("keeps disconnected fallback components ungrouped and avoids cycles", () => {
    const result = bubbleFallbacks([edge("x", "y", 0.8), edge("y", "z", 0.7), edge("x", "z", 0.6)], 0.9, { a: 0 });
    expect(result.assignment).toEqual({ a: 0 });
    expect(result.links).toHaveLength(2);
  });

  it("handles a fallback-only view without inventing core communities", () => {
    const result = bubbleFallbacks([edge("a", "b", 1), edge("b", "c", 0.5), edge("a", "c", 0)], 1.01, {});
    expect(result.assignment).toEqual({});
    expect(result.links).toHaveLength(2);
    expect(bubbleFallbacks([], 1, {})).toEqual({ assignment: {}, links: [] });
  });

  it("never uses missing metrics or links that meet the primary cutoff", () => {
    const result = bubbleFallbacks([edge("a", "x", null), edge("a", "y", NaN), edge("a", "z", 0.8)], 0.8, { a: 0 });
    expect(result.links).toEqual([]);
  });
});
