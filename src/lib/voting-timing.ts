import { z } from "zod";

export const timingMeasures = ["order", "window", "combined"] as const;
export type TimingMeasure = (typeof timingMeasures)[number];
export function parseTimingMeasure(value: unknown): TimingMeasure {
  return value === "window" || value === "combined" ? value : "order";
}

// UTC offsets are mandatory: ambiguous local wall times cannot define a window.
const instant = z.iso.datetime({ offset: true }).nullable();
export const votingWindowSchema = z.object({ opensAt: instant, closesAt: instant }).strict().refine(
  ({ opensAt, closesAt }) => opensAt === null && closesAt === null ||
    opensAt !== null && closesAt !== null && Date.parse(closesAt) > Date.parse(opensAt),
  "Set both voting times, with closing after opening, or clear both.",
);

export function combinedTiming(order: number | null, window: number | null): number | null {
  return order === null || window === null ? null : (order + window) / 2;
}
