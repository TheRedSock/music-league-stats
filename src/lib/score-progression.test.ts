import { describe, expect, it } from "vitest";
import { buildProgression, progressionPointTicks, progressionTopPlayerIds, type ProgressionRow } from "./score-progression";

const row = (ordinal: number, playerId: string, points: number): ProgressionRow => ({
  leagueId: "league", leagueName: "League", roundId: `r${ordinal}`,
  roundName: `Round ${ordinal}`, ordinal, playerId, playerName: playerId, points,
});

describe("score progression", () => {
  it("keeps point axes close to the maximum across magnitude boundaries", () => {
    expect(progressionPointTicks(419)).toEqual([0, 110, 220, 330, 440]);
    expect(progressionPointTicks(365)).toEqual([0, 95, 190, 285, 380]);
    for (const maximum of [0, 1, 4, 9, 99, 100, 401, 999, 1000]) {
      const ticks = progressionPointTicks(maximum);
      expect(ticks[4]).toBeGreaterThan(maximum);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });
  it("filters by final rank including ties without recalculating earlier standings", () => {
    const { timeline } = buildProgression([
      row(1, "A", 8), row(1, "B", 2), row(1, "C", 1),
      row(2, "B", 8), row(2, "C", 7),
    ]);
    const final = timeline[1].standings;
    expect([...progressionTopPlayerIds(final, 1)]).toEqual(["B"]);
    expect([...progressionTopPlayerIds(final, 2)]).toEqual(["B", "A", "C"]);
    expect(progressionTopPlayerIds(final, null).size).toBe(3);
    expect(progressionTopPlayerIds(final, 20).size).toBe(3);
    expect(timeline[0].values.find((player) => player.id === "B")?.rank).toBe(2);
  });
  it("orders rounds, aggregates songs, carries missed rounds, and handles lead changes and ties", () => {
    const { timeline } = buildProgression([
      row(3, "B", 9), row(1, "A", 3), row(1, "A", 2),
      row(1, "B", 1), row(2, "B", 4), row(3, "C", 0),
    ]);
    expect(timeline.map((round) => round.ordinal)).toEqual([1, 2, 3]);
    expect(timeline[0].standings.map((p) => [p.id, p.total, p.rank])).toEqual([
      ["A", 5, 1], ["B", 1, 2], ["C", 0, 3],
    ]);
    expect(timeline[1].standings.map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(timeline[1].values[0]).toMatchObject({ total: 5, points: 0, entered: false });
    expect(timeline[2].standings[0]).toMatchObject({ id: "B", total: 14, rank: 1 });
    expect(timeline[2].values[2]).toMatchObject({ points: 0, entered: true });
  });
  it("supports empty and single-round timelines without inventing rounds in a subset", () => {
    expect(buildProgression([])).toEqual({ players: [], timeline: [] });
    expect(buildProgression([row(4, "A", 0)]).timeline[0]).toMatchObject({ ordinal: 4 });
  });
});
