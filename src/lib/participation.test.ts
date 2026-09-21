import { describe, expect, it } from "vitest";
import { participationFraction, qualificationFeatureFloor, qualificationRoundFloor } from "./participation";

describe("adaptive participation", () => {
  it("requires three of six rounds while keeping 26 of 78 at full scope", () => {
    expect(qualificationRoundFloor(6, 78)).toBe(3);
    expect(qualificationRoundFloor(4, 78)).toBe(2);
    expect(qualificationRoundFloor(78, 78)).toBe(26);
    expect(qualificationFeatureFloor(6, 78)).toBe(15);
  });

  it("eases faster than a linear curve and remains between a third and a half", () => {
    let previous = 0.5;
    for (let scope = 1; scope <= 100; scope++) {
      const fraction = participationFraction(scope, 100);
      expect(fraction).toBeLessThanOrEqual(previous);
      expect(fraction).toBeGreaterThanOrEqual(1 / 3);
      expect(fraction).toBeLessThanOrEqual(0.5 - scope / 100 / 6 + 1e-12);
      previous = fraction;
    }
    expect(participationFraction(100, 100)).toBeCloseTo(1 / 3);
  });

  it("never lowers the required round count when expanding a fixed dataset's scope", () => {
    for (const total of [1, 6, 78, 500]) {
      let previous = 1;
      for (let scope = 1; scope <= total; scope++) {
        const floor = qualificationRoundFloor(scope, total);
        expect(floor).toBeGreaterThanOrEqual(previous);
        expect(floor).toBeLessThanOrEqual(scope);
        previous = floor;
      }
    }
    expect(qualificationRoundFloor(0, 0)).toBe(1);
    expect(qualificationRoundFloor(Number.NaN, 78)).toBe(1);
  });
});
