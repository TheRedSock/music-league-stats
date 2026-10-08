import { expect, it } from "vitest";
import { scopeCapacityMessage } from "./scope-budget";

it("admits ordinary comparisons and bounds concurrent and hourly work", () => {
  expect(scopeCapacityMessage(11, 1)).toBeNull();
  expect(scopeCapacityMessage(12, 0)).toContain("recently");
  expect(scopeCapacityMessage(0, 2)).toContain("updating");
});
