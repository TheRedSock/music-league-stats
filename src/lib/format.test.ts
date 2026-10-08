import { expect, it } from "vitest";
import { ordinal, formatPoints } from "./format";

it("formats percentile ordinals including teens and rounded values", () => {
  expect([1, 2, 3, 11, 12, 13, 21, 52, 111, 11.8].map(ordinal)).toEqual(["1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "52nd", "111th", "12th"]);
  expect(formatPoints(1)).toBe("1 pt");
  expect(formatPoints(2)).toBe("2 pts");
});
