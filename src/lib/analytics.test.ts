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
  leagueTableLabel,
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
  qualificationRoundFloor,
  resolveAnalyticsFilter,
  safeRatio,
  estimateSupportIndexVarianceComponents,
  supportIndex,
  supportIndexEb,
  supportZ,
  timingMidpointPercentile,
  truncateArtistForMeta,
  truncateRoundName,
  compareVotedSongsByPoints,
  fairShareBlowout,
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

  it("requires one third of scope rounds for round-adjusted qualification", () => {
    expect(qualificationRoundFloor(37)).toBe(13);
    expect(qualificationRoundFloor(4)).toBe(2);
    expect(qualificationRoundFloor(3)).toBe(1);
    expect(qualificationRoundFloor(1)).toBe(1);
    expect(qualificationRoundFloor(0)).toBe(1);
  });

  it("expresses support relative to expected eligible ballot points", () => {
    expect(supportIndex(20, 20)).toBe(1);
    expect(supportIndex(40, 20)).toBe(2);
    expect(supportIndex(0, 0)).toBeNull();
  });

  it("scores fair-share blowout as multiples diluted by tied peers", () => {
    // Unique 5 with fifteen 1s on a 16-song, 20-point ballot.
    const uniqueFive = fairShareBlowout(5, 20, 16, 1);
    // Four 5s (rest zeroes) on the same slate size and budget.
    const oneOfFourFives = fairShareBlowout(5, 20, 16, 4);
    // Unique 4 among 1s can outrank a diluted 5 when sorting by blowout alone.
    const uniqueFour = fairShareBlowout(4, 20, 16, 1);

    expect(uniqueFive).toBe(4);
    expect(oneOfFourFives).toBe(1);
    expect(uniqueFour).toBe(3.2);
    expect(uniqueFive!).toBeGreaterThan(oneOfFourFives!);
    expect(uniqueFour!).toBeGreaterThan(oneOfFourFives!);
    expect(fairShareBlowout(5, 0, 16, 1)).toBeNull();
  });

  it("breaks equal points with higher ballot blowout when ranking voted songs", () => {
    const uniqueFive = {
      pointsGiven: 5,
      ballotBlowout: fairShareBlowout(5, 20, 16, 1),
      title: "Solo favorite",
    };
    const sharedFive = {
      pointsGiven: 5,
      ballotBlowout: fairShareBlowout(5, 20, 16, 4),
      title: "Shared favorite",
    };
    expect(compareVotedSongsByPoints(uniqueFive, sharedFive)).toBeLessThan(0);
  });

  it("separates ballot blowout from crowd contrast on the same 5", () => {
    // Own ballot: unique 5 on 25 points / 46 songs → 9.2×
    expect(fairShareBlowout(5, 25, 46, 1)).toBeCloseTo(9.2, 5);
    // Same song field: 5 among 13 total points / 22 voters, unique top → ~8.46×
    expect(fairShareBlowout(5, 13, 22, 1)).toBeCloseTo((5 * 22) / 13, 5);
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

  it("shrinks support index toward 1.0 more when expected points are small", () => {
    const components = { phi: 1.35, tau2: 0.08 };
    const lowE = supportIndexEb(2.5, 10, components);
    const highE = supportIndexEb(2.5, 20, components);
    expect(lowE).not.toBeNull();
    expect(highE).not.toBeNull();
    expect(lowE!).toBeLessThan(highE!);
    expect(lowE!).toBeGreaterThan(1);
    expect(highE!).toBeLessThan(2.5);
  });

  it("keeps raw support index when prior variance is unavailable", () => {
    expect(supportIndexEb(2.5, 10, { phi: 1.35, tau2: 0 })).toBe(2.5);
  });

  it("preserves support-index order when expected points match", () => {
    const components = { phi: 1.35, tau2: 0.08 };
    const lower = supportIndexEb(1.5, 16, components)!;
    const higher = supportIndexEb(2.0, 16, components)!;
    expect(higher).toBeGreaterThan(lower);
  });

  it("scores the same support index as a higher z with larger expected points", () => {
    const phi = 1.35;
    const lowE = supportZ(25, 10, phi)!; // SI = 2.5
    const highE = supportZ(50, 20, phi)!; // SI = 2.5
    expect(highE).toBeGreaterThan(lowE);
  });

  it("estimates variance components from binned SI dispersion", () => {
    const songs = [];
    for (let i = 0; i < 40; i += 1) {
      songs.push({ supportIndex: 1 + (i % 5) * 0.1, expectedPoints: 11 });
      songs.push({ supportIndex: 1 + (i % 3) * 0.05, expectedPoints: 20 });
    }
    const components = estimateSupportIndexVarianceComponents(songs);
    expect(components).not.toBeNull();
    expect(components!.phi).toBeGreaterThan(0);
    expect(components!.tau2).toBeGreaterThanOrEqual(0);
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
  it("accepts UUID league filters and ignores retired round params", () => {
    expect(parseAnalyticsFilters({ league: leagueId, round: roundId })).toEqual({
      leagueIds: [leagueId],
      roundIds: [],
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
      roundIds: [],
      useDefaultLeague: false,
    });
  });

  it("defaults an omitted scope to all leagues and preserves explicit all", () => {
    expect(resolveAnalyticsFilter(parseAnalyticsFilters({}), options)).toEqual({
      leagueIds: [],
      roundIds: [],
    });
    expect(
      resolveAnalyticsFilter(parseAnalyticsFilters({ league: "all" }), options),
    ).toEqual({
      leagueIds: [],
      roundIds: [],
    });
  });

  it("formats compact table labels", () => {
    expect(leagueTableLabel({ name: "League A", slug: "league-a" })).toBe(
      "league-a",
    );
    expect(leagueTableLabel({ name: "League A", slug: "" })).toBe("League A");
    expect(truncateRoundName("Short round")).toBe("Short round");
    expect(truncateRoundName("A".repeat(60))).toHaveLength(50);
    expect(truncateRoundName("A".repeat(60)).endsWith("…")).toBe(true);
  });

  it("soft-caps artist on meta lines only when the full line is over budget", () => {
    const longArtist = "A".repeat(40);
    const shortScope = truncateArtistForMeta(
      longArtist,
      "lg",
      1,
      "Round",
    );
    // artist(40) + " · "(3) + "lg · R1 · Round"(14) = 57 ≤ 80 → keep full artist
    expect(shortScope).toBe(longArtist);

    const longScope = truncateArtistForMeta(
      longArtist,
      "spring-2025",
      9,
      "Alien reproducing music (intercourse) (1 Song p.p.)",
    );
    expect(longScope.length).toBe(30);
    expect(longScope.endsWith("…")).toBe(true);
    expect(longScope.startsWith("A".repeat(29))).toBe(true);
  });

  it("drops round ids from resolved filters", () => {
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
    ).toEqual({ leagueIds: [], roundIds: [] });
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
