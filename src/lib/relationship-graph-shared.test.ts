import { describe, expect, it } from "vitest";
import { buildWeightScale, buildDensityWeightScale, bubbleWeightScale, directedWeightScale, normalizedToRaw, type DirectedRelationshipEdge, type UndirectedRelationshipEdge } from "./relationship-graph-shared";

function visible(weights: number[], position: number) {
  const scale = buildWeightScale(weights);
  return weights.filter(weight => weight >= normalizedToRaw(position, scale)).length;
}

describe("graph filtering", () => {
  it("covers all through none for small, large, constant, zero and outlier distributions", () => {
    for (const weights of [[0.4], [0, 0, 0], [0.9, 0.9, 0.9], [1, 2, 3, 1000], Array.from({ length: 1000 }, (_, i) => i / 1000)]) {
      expect(visible(weights, 0)).toBe(weights.length);
      expect(visible(weights, 1)).toBe(0);
      let previous = weights.length;
      for (let step = 0; step <= 100; step++) {
        const count = visible(weights, step / 100);
        expect(count).toBeLessThanOrEqual(previous);
        previous = count;
      }
    }
  });

  it("filters the same share regardless of metric units or dataset size", () => {
    for (const n of [10, 100, 1000]) {
      for (const factor of [0.001, 1, 100]) {
        const weights = Array.from({ length: n }, (_, i) => (i + 1) * factor);
        expect(visible(weights, 0.5)).toBe(n / 2);
        expect(visible(weights, 0.9)).toBe(n / 10);
      }
    }
  });

  it("keeps ties together and chooses a nonempty attainable default", () => {
    const weights = [0, 0, 0.5, 0.5, 1, 1];
    const scale = buildWeightScale(weights, 3);
    expect(visible(weights, scale.defaultNormalized)).toBe(2);
    const constant = buildWeightScale([1, 1, 1], 1);
    expect(visible([1, 1, 1], constant.defaultNormalized)).toBe(3);
    expect(buildWeightScale([NaN, Infinity]).sampleSize).toBe(0);
  });

  it("targets bounded per-player density for both small and large graphs", () => {
    for (const n of [6, 30]) {
      const pairs: UndirectedRelationshipEdge[] = [];
      const directed: DirectedRelationshipEdge[] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const weight = pairs.length + 1;
        pairs.push({ source: `${i}`, target: `${j}`, sourceName: `${i}`, targetName: `${j}`, alignment: weight, mutualShare: weight, sharedRounds: 4, comparableFeatures: 20, mutualPoints: 10 });
        directed.push({ source: `${i}`, target: `${j}`, sourceName: `${i}`, targetName: `${j}`, pointsPerOpportunity: weight, points: 10, opportunities: 4, positiveRate: 1, sharedRounds: 4 });
      }
      const bubbleScale = bubbleWeightScale(pairs);
      const flowScale = directedWeightScale(directed);
      const bubbleCount = pairs.filter(edge => edge.alignment! >= normalizedToRaw(bubbleScale.defaultNormalized, bubbleScale)).length;
      const flowCount = directed.filter(edge => edge.pointsPerOpportunity >= normalizedToRaw(flowScale.defaultNormalized, flowScale)).length;
      expect(bubbleScale.defaultNormalized).toBe(0.5);
      expect(flowScale.defaultNormalized).toBe(0.5);
      expect(Math.abs(bubbleCount - Math.min(n * 1.25, pairs.length / 2))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(flowCount - Math.min(n * 1.5, directed.length / 2))).toBeLessThanOrEqual(0.5);
    }
  });

  it("spreads useful per-player density across the control independently of edge count and units", () => {
    for (const n of [10, 30, 100]) for (const samplesPerPlayer of [5, 20, 50]) for (const unit of [0.01, 100]) {
      const weights = Array.from({ length: n * samplesPerPlayer }, (_, i) => i * unit);
      const scale = buildDensityWeightScale(weights, n, 1.5);
      for (const position of [0, 0.25, 0.5, 0.75, 1]) {
        const count = weights.filter(w => w >= normalizedToRaw(position, scale)).length;
        expect(Math.abs(count - n * 3 * (1 - position))).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("selects the closest attainable count around large ties instead of overshooting the default", () => {
    // A short scope can have 58 links at >=2, but only 36 at >2.
    const weights = [...Array(592).fill(1), ...Array(22).fill(2), ...Array(36).fill(2.2)];
    const scale = buildDensityWeightScale(weights, 27, 1.5);
    expect(weights.filter(w => w >= normalizedToRaw(0.5, scale))).toHaveLength(36);
  });

  it("keeps density cutoffs monotonic and nonempty before 100%, including sparse and tied scopes", () => {
    for (const weights of [[], [0], [1, 1, 1], [0, 0, 0.1, 0.5, 0.5, 1], [1, 2, 1000]]) {
      const scale = buildDensityWeightScale(weights, 5, 1.25);
      let previous = weights.length;
      for (let step = 0; step <= 100; step++) {
        const count = weights.filter(w => w >= normalizedToRaw(step / 100, scale)).length;
        expect(count).toBeLessThanOrEqual(previous);
        if (step < 100 && weights.length) expect(count).toBeGreaterThan(0);
        if (step === 100) expect(count).toBe(0);
        previous = count;
      }
    }
    expect(buildDensityWeightScale([NaN, Infinity], 5, 1.5).sampleSize).toBe(0);
  });
});
