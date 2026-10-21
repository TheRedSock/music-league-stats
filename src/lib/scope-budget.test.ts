import { expect, it } from "vitest";
import { scopeCapacityMessage, scopeRetryMessage } from "./scope-budget";

it("admits ordinary comparisons and bounds concurrent and hourly work", () => {
  expect(scopeCapacityMessage(7, 1, 23, 59)).toBeNull();
  expect(scopeCapacityMessage(8, 0)).toContain("recently");
  expect(scopeCapacityMessage(0, 2)).toContain("updating");
  expect(scopeCapacityMessage(0, 0, 24)).toContain("today");
  expect(scopeCapacityMessage(0, 0, 0, 60)).toContain("budget");
});

it("backs off failed work and stops repeated failures", () => {
  const failedAt = new Date(1000);
  expect(scopeRetryMessage(1, failedAt, 60_999)).toContain("Wait");
  expect(scopeRetryMessage(1, failedAt, 61_000)).toBeNull();
  expect(scopeRetryMessage(2, failedAt, 61_000)).toContain("Wait");
  expect(scopeRetryMessage(2, failedAt, 301_000)).toBeNull();
  expect(scopeRetryMessage(3, failedAt, 86_400_000)).toContain("repeatedly");
});
