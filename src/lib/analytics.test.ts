import { describe, expect, it } from "vitest";

import {
  buildAnalyticsHref,
  cosineSimilarity,
  createPointDistribution,
  defaultPlayerSortDirection,
  defaultRelationshipSortDirection,
  defaultSongSortDirection,
  filterPointBuckets,
  isoTimestamp,
  parseAnalyticsFilters,
  parseFocusPlayerId,
  parsePlayerSort,
  parsePlayerSortDirection,
  parseRelationshipSort,
  parseRelationshipSortDirection,
  parseRelationshipTab,
  parseSongSort,
  parseSongSortDirection,
  percentileRank,
  resolveAnalyticsFilter,
  safeRatio,
  supportIndex,
  timingMidpointPercentile,
  type FilterOptions,
} from "@/lib/analytics";

const leagueId = "11111111-1111-4111-8111-111111111111";
const otherLeagueId = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";

const options: FilterOptions = {
  defaultLeagueId: leagueId,
  leagues: [
    { id: leagueId, name: "League A", slug: "league-a", musicLeagueId: null },
    {
      id: otherLeagueId,
      name: "League B",
      slug: "league-b",
      musicLeagueId: null,
    },
  ],
  rounds: [
    {
      id: roundId,
      leagueId,
      leagueName: "League A",
      leagueMusicLeagueId: null,
      sourceRoundId: "source-round-1",
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

  it("expresses support relative to expected eligible ballot points", () => {
    expect(supportIndex(20, 20)).toBe(1);
    expect(supportIndex(40, 20)).toBe(2);
    expect(supportIndex(0, 0)).toBeNull();
  });

  it("keeps average songs at 1.0 across different ballot budgets", () => {
    const oneSubmissionExpected = 4 * (4 / 4);
    const twoSubmissionExpected = 4 * (6 / 8);

    expect(supportIndex(oneSubmissionExpected, oneSubmissionExpected)).toBe(1);
    expect(supportIndex(twoSubmissionExpected, twoSubmissionExpected)).toBe(1);
    expect(supportIndex(twoSubmissionExpected * 1.5, twoSubmissionExpected)).toBe(
      1.5,
    );
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
      { label: "0", count: 3, pointTotal: 0 },
      { label: "1", count: 2, pointTotal: 2 },
      { label: "2", count: 0, pointTotal: 0 },
      { label: "3", count: 0, pointTotal: 0 },
      { label: "4", count: 0, pointTotal: 0 },
      { label: "5", count: 1, pointTotal: 5 },
      { label: "5+", count: 4, pointTotal: 32 },
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
      { label: "1", count: 2, pointTotal: 2 },
      { label: "2", count: 0, pointTotal: 0 },
      { label: "3", count: 0, pointTotal: 0 },
      { label: "4", count: 0, pointTotal: 0 },
      { label: "5", count: 1, pointTotal: 5 },
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

  it("calculates tie-aware midpoint timing percentiles", () => {
    expect(
      timingMidpointPercentile({ ballotRank: 1, observedVoters: 5 }),
    ).toBe(0.1);
    expect(
      timingMidpointPercentile({ ballotRank: 5, observedVoters: 5 }),
    ).toBe(0.9);
    expect(
      timingMidpointPercentile({
        ballotRank: 1,
        observedVoters: 5,
        tieCount: 2,
      }),
    ).toBe(0.2);
    expect(
      timingMidpointPercentile({ ballotRank: 1, observedVoters: 1 }),
    ).toBe(0.5);
    expect(
      timingMidpointPercentile({ ballotRank: 0, observedVoters: 5 }),
    ).toBeNull();
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
      leagueIds: [leagueId],
      roundIds: [roundId],
      useDefaultLeague: false,
    });
    expect(parseAnalyticsFilters({ league: "nope", round: "also-nope" })).toEqual({
      leagueIds: [],
      roundIds: [],
      useDefaultLeague: false,
    });
    expect(
      parseAnalyticsFilters({ league: [otherLeagueId, leagueId], round: [roundId] }),
    ).toEqual({
      leagueIds: [leagueId, otherLeagueId],
      roundIds: [roundId],
      useDefaultLeague: false,
    });
  });

  it("defaults an omitted scope to the latest league but preserves explicit all", () => {
    expect(resolveAnalyticsFilter(parseAnalyticsFilters({}), options)).toEqual({
      leagueIds: [leagueId],
      roundIds: [],
    });
    expect(
      resolveAnalyticsFilter(parseAnalyticsFilters({ league: "all" }), options),
    ).toEqual({
      leagueIds: [],
      roundIds: [],
    });
  });

  it("intersects selected rounds with selected leagues", () => {
    expect(
      resolveAnalyticsFilter(
        { leagueIds: [otherLeagueId], roundIds: [roundId], useDefaultLeague: false },
        options,
      ),
    ).toEqual({ leagueIds: [otherLeagueId], roundIds: [] });
    expect(
      resolveAnalyticsFilter(
        { leagueIds: [], roundIds: [roundId], useDefaultLeague: false },
        options,
      ),
    ).toEqual({ leagueIds: [], roundIds: [roundId] });
  });

  it("preserves current query state while applying overrides", () => {
    expect(
      buildAnalyticsHref(
        "/songs",
        { league: [leagueId, otherLeagueId], q: "disco", page: 3 },
        { page: 1, q: null },
      ),
    ).toBe(`/songs?league=${leagueId}&league=${otherLeagueId}&page=1`);
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
    expect(parseRelationshipTab("alignment")).toBe("alignment");
    expect(parseRelationshipTab("nope")).toBe("received");
    expect(parseRelationshipSort(undefined, "mutual")).toBe("share");
    expect(parseRelationshipSort("features", "alignment")).toBe("features");
    expect(defaultRelationshipSortDirection("player")).toBe("asc");
    expect(parseRelationshipSortDirection(undefined, "timing")).toBe("desc");
    expect(parseFocusPlayerId(leagueId)).toBe(leagueId);
    expect(parseFocusPlayerId("nope")).toBeNull();
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
