import { describe, expect, it } from "vitest";

import {
  buildAnalyticsHref,
  cosineSimilarity,
  createPointDistribution,
  defaultPlayerSortDirection,
  defaultSongSortDirection,
  filterPointBuckets,
  isoTimestamp,
  parseAnalyticsFilters,
  parsePlayerSort,
  parsePlayerSortDirection,
  parseSongSort,
  parseSongSortDirection,
  percentileRank,
  resolveAnalyticsFilter,
  safeRatio,
  supportIndex,
  type FilterOptions,
} from "@/lib/analytics";

const leagueId = "11111111-1111-4111-8111-111111111111";
const otherLeagueId = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";

const options: FilterOptions = {
  leagues: [
    { id: leagueId, name: "League A", slug: "league-a" },
    { id: otherLeagueId, name: "League B", slug: "league-b" },
  ],
  rounds: [
    {
      id: roundId,
      leagueId,
      leagueName: "League A",
      name: "Round one",
      ordinal: 1,
    },
  ],
};

describe("analytics metric helpers", () => {
  it("returns safe ratios only for positive denominators", () => {
    expect(safeRatio(5, 2)).toBe(2.5);
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(Number.NaN, 2)).toBeNull();
  });

  it("expresses support relative to an equal round share", () => {
    expect(supportIndex(20, 100, 5)).toBe(1);
    expect(supportIndex(40, 100, 5)).toBe(2);
    expect(supportIndex(0, 0, 5)).toBeNull();
  });

  it("keeps explicit zero and overflow point buckets", () => {
    expect(
      createPointDistribution([
        { points: 0, count: 3 },
        { points: 1, count: 2 },
        { points: 5, count: 1 },
        { points: 8, count: 4 },
      ]),
    ).toEqual([
      { label: "0", count: 3 },
      { label: "1", count: 2 },
      { label: "2", count: 0 },
      { label: "3", count: 0 },
      { label: "4", count: 0 },
      { label: "5", count: 1 },
      { label: "5+", count: 4 },
    ]);
  });

  it("filters point buckets to the default 1-5 range", () => {
    const buckets = createPointDistribution([
      { points: 0, count: 3 },
      { points: 1, count: 2 },
      { points: 5, count: 1 },
      { points: 8, count: 4 },
    ]);

    expect(filterPointBuckets(buckets, "standard")).toEqual([
      { label: "1", count: 2 },
      { label: "2", count: 0 },
      { label: "3", count: 0 },
      { label: "4", count: 0 },
      { label: "5", count: 1 },
    ]);
    expect(filterPointBuckets(buckets, "extended")).toEqual(buckets);
  });

  it("calculates percentile and cosine helpers", () => {
    expect(percentileRank([1, 2, 3], 2)).toBe(50);
    expect(percentileRank([4], 4)).toBe(100);
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBeNull();
  });

  it("normalizes database timestamps returned as dates or strings", () => {
    const timestamp = "2026-07-22T14:30:00.000Z";
    expect(isoTimestamp(timestamp)).toBe(timestamp);
    expect(isoTimestamp(new Date(timestamp))).toBe(timestamp);
    expect(() => isoTimestamp("not-a-date")).toThrow("invalid timestamp");
  });
});

describe("analytics filter helpers", () => {
  it("accepts UUID filters and rejects arbitrary query values", () => {
    expect(parseAnalyticsFilters({ league: leagueId, round: roundId })).toEqual({
      leagueId,
      roundId,
    });
    expect(parseAnalyticsFilters({ league: "nope", round: "also-nope" })).toEqual({
      leagueId: null,
      roundId: null,
    });
  });

  it("drops a round that does not belong to the selected league", () => {
    expect(
      resolveAnalyticsFilter(
        { leagueId: otherLeagueId, roundId },
        options,
      ),
    ).toEqual({ leagueId: otherLeagueId, roundId: null });
    expect(
      resolveAnalyticsFilter({ leagueId: null, roundId }, options),
    ).toEqual({ leagueId: null, roundId });
  });

  it("preserves current query state while applying overrides", () => {
    expect(
      buildAnalyticsHref(
        "/songs",
        { league: leagueId, q: "disco", page: 3 },
        { page: 1, q: null },
      ),
    ).toBe(`/songs?league=${leagueId}&page=1`);
  });

  it("parses sort keys and uses natural default directions", () => {
    expect(parseSongSort("title")).toBe("title");
    expect(parseSongSort("nope")).toBe("points");
    expect(parsePlayerSort("top-quartile")).toBe("top-quartile");
    expect(parsePlayerSort("nope")).toBe("performance");
    expect(defaultSongSortDirection("title")).toBe("asc");
    expect(defaultSongSortDirection("points")).toBe("desc");
    expect(defaultPlayerSortDirection("name")).toBe("asc");
    expect(defaultPlayerSortDirection("performance")).toBe("desc");
    expect(parseSongSortDirection(undefined, "title")).toBe("asc");
    expect(parsePlayerSortDirection("asc", "points")).toBe("asc");
  });

  it("builds sortable header hrefs by clearing search and pagination", () => {
    expect(
      buildAnalyticsHref(
        "/songs",
        { league: leagueId, q: "disco", page: 4, sort: "points", dir: "desc" },
        { sort: "title", dir: "asc", q: null, page: null },
      ),
    ).toBe(`/songs?league=${leagueId}&sort=title&dir=asc`);
  });
});
