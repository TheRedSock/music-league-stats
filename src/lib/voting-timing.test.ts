import { describe, expect, it } from "vitest";
import { combinedTiming, parseTimingMeasure, votingWindowSchema } from "./voting-timing";

describe("voting duration",()=>{
  it("gives order and elapsed time equal weight for a complete ballot",()=>{
    expect(combinedTiming(0.2,109/120)).toBeCloseTo((0.2+109/120)/2,12);
  });
  it("preserves scores outside the window instead of clamping late ballots",()=>{
    expect(combinedTiming(0.8,1.2)).toBeCloseTo(1,12);
  });
  it("excludes missing windows and ballots from the combined score",()=>{
    expect(combinedTiming(0.2,null)).toBeNull();
    expect(combinedTiming(null,0.8)).toBeNull();
    expect(parseTimingMeasure("unknown")).toBe("order");
  });
  it("requires complete, ordered windows with explicit offsets",()=>{
    expect(votingWindowSchema.safeParse({opensAt:null,closesAt:null}).success).toBe(true);
    for(const input of [
      {opensAt:"2026-01-01T00:00:00Z",closesAt:null},
      {opensAt:"2026-01-01T00:00:00",closesAt:"2026-01-02T00:00:00"},
      {opensAt:"2026-01-02T00:00:00Z",closesAt:"2026-01-01T00:00:00Z"},
    ]) expect(votingWindowSchema.safeParse(input).success).toBe(false);
  });
});
