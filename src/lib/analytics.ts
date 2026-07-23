import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { db } from "@/db";
import { competitors, leagues, rounds } from "@/db/schema";
import {
  createPointDistribution,
  type PointBucket,
} from "@/lib/point-buckets";
import { ANALYTICS_REVISION } from "@/lib/analytics-revision";

const ANALYTICS_CACHE_TAG = "analytics";

export {
  createPointDistribution,
  filterPointBuckets,
  pointBucket,
  STANDARD_POINT_LABELS,
} from "@/lib/point-buckets";
export type { PointBucket, PointBucketRange } from "@/lib/point-buckets";

export type SearchParams = Record<string, string | string[] | undefined>;

export type AnalyticsFilterRequest = {
  leagueIds: string[];
  roundIds: string[];
  useDefaultLeague: boolean;
};

export type AnalyticsFilter = {
  leagueIds: string[];
  roundIds: string[];
};

export type LeagueOption = {
  id: string;
  name: string;
  slug: string;
  musicLeagueId: string | null;
};

export type RoundOption = {
  id: string;
  leagueId: string;
  leagueName: string;
  leagueMusicLeagueId: string | null;
  sourceRoundId: string;
  name: string;
  ordinal: number;
};

export type FilterOptions = {
  leagues: LeagueOption[];
  rounds: RoundOption[];
  defaultLeagueId: string | null;
};

export type AnalyticsLoad<T> =
  | { status: "ready"; data: T }
  | { status: "setup" }
  | { status: "unavailable" }
  | {
      status: "building";
      progressLabel: string | null;
    };

export type DashboardData = {
  summary: {
    leagues: number;
    rounds: number;
    players: number;
    songs: number;
    points: number;
  };
  leaderboard: Array<{
    id: string;
    name: string;
    totalPoints: number;
    normalizedIndex: number | null;
    enteredRounds: number;
  }>;
  topSongs: SongAnalyticsRow[];
  pointDistribution: PointBucket[];
  alignment: Array<{
    leftId: string;
    leftName: string;
    rightId: string;
    rightName: string;
    alignment: number;
    comparableFeatures: number;
    sharedRounds: number;
    scopeRounds: number;
  }>;
};

export type SongAnalyticsRow = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  spotifyUri: string;
  spotifyUrl: string | null;
  submitterId: string;
  submitterName: string;
  leagueId: string;
  leagueName: string;
  leagueSlug: string;
  leagueMusicLeagueId: string | null;
  roundId: string;
  sourceRoundId: string;
  roundName: string;
  roundOrdinal: number;
  submittedAt: string;
  points: number;
  expectedPoints: number;
  eligibleRows: number;
  positiveRows: number;
  pointsPerEligibleVoter: number | null;
  positiveReach: number | null;
  roundPointShare: number | null;
  supportIndex: number | null;
  supportIndexEb: number | null;
  supportZ: number | null;
  performancePercentile: number | null;
};

export {
  defaultSongSortDirection,
  leagueTableLabel,
  songSorts,
  sortDirections,
  truncateRoundName,
  type SongSort,
  type SortDirection,
} from "@/lib/analytics-view";
import {
  defaultSongSortDirection,
  songSorts,
  sortDirections,
  type SongSort,
  type SortDirection,
} from "@/lib/analytics-view";

export type SongsData = {
  rows: SongAnalyticsRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SongSort;
  direction: SortDirection;
  search: string;
};

export const playerSorts = [
  "performance",
  "points",
  "songs",
  "rounds",
  "name",
  "points-per-song",
  "points-per-voter",
  "percentile",
  "wins",
  "top-quartile",
] as const;
export type PlayerSort = (typeof playerSorts)[number];

export type PlayerDirectoryRow = {
  id: string;
  name: string;
  totalPoints: number;
  submissions: number;
  enteredRounds: number;
  pointsPerSubmission: number | null;
  pointsPerEligibleVoter: number | null;
  averageRoundIndex: number | null;
  averageRoundPercentile: number | null;
  roundWins: number;
  topQuartileRate: number | null;
  performanceRank: number | null;
  provisional: boolean;
};

export type PlayersData = {
  rows: PlayerDirectoryRow[];
  sort: PlayerSort;
  direction: SortDirection;
  search: string;
  minimumRounds: number;
};

export type DirectionalRelationship = {
  direction: "received" | "given";
  competitorId: string;
  competitorName: string;
  points: number;
  encounters: number;
  sharedRounds: number;
  scopeRounds: number;
  pointsPerEncounter: number;
  positiveRate: number;
};

export type MutualRelationship = {
  competitorId: string;
  competitorName: string;
  points: number;
  opportunities: number;
  sharedRounds: number;
  scopeRounds: number;
  pointsPerOpportunity: number;
  positiveRate: number;
  ballotPointShare: number;
};

export type TimingRow = {
  roundId: string;
  roundName: string;
  leagueName: string;
  leagueSlug: string;
  leagueMusicLeagueId: string | null;
  sourceRoundId: string;
  ordinal: number;
  castAt: string | null;
  relativeOrder: number | null;
  ballotRank: number | null;
  tieCount: number | null;
  observedVoters: number;
  participation: "voted" | "did_not_vote";
};

export type PlayerProfileData = {
  player: { id: string; name: string };
  overview: PlayerDirectoryRow | null;
  submissions: SongAnalyticsRow[];
  receivedDistribution: PointBucket[];
  givenDistribution: PointBucket[];
  relationships: DirectionalRelationship[];
  mutualRelationships: MutualRelationship[];
  alignments: Array<{
    competitorId: string;
    competitorName: string;
    alignment: number;
    comparableFeatures: number;
    sharedRounds: number;
    scopeRounds: number;
  }>;
  timing: TimingRow[];
};

export const relationshipTabs = [
  "received",
  "given",
  "mutual",
  "alignment",
  "timing",
] as const;
export type RelationshipTab = (typeof relationshipTabs)[number];

export const relationshipSorts = [
  "player",
  "points",
  "rate",
  "opportunities",
  "positive",
  "rounds",
  "share",
  "alignment",
  "features",
  "timing",
  "missed",
] as const;
export type RelationshipSort = (typeof relationshipSorts)[number];

export type RelationshipTableRow = {
  leftId: string;
  leftName: string;
  rightId: string | null;
  rightName: string | null;
  points: number | null;
  opportunities: number | null;
  sharedRounds: number | null;
  scopeRounds: number | null;
  pointsPerOpportunity: number | null;
  positiveRate: number | null;
  ballotPointShare: number | null;
  alignment: number | null;
  comparableFeatures: number | null;
  averageTiming: number | null;
  votedRounds: number | null;
  missedBallots: number | null;
};

export type RelationshipsTableData = {
  tab: RelationshipTab;
  sort: RelationshipSort;
  direction: SortDirection;
  focusPlayer: { id: string; name: string } | null;
  rows: RelationshipTableRow[];
  needsScopeMaterialization?: boolean;
  scopeKey?: string;
};

export type SubmissionFactsData = {
  mostSubmittedArtists: Array<{
    artist: string;
    submissions: number;
    submitters: number;
  }>;
  artistLoyalists: Array<{
    playerId: string;
    playerName: string;
    artist: string;
    submissions: number;
  }>;
  repeatedSongs: Array<{
    spotifyUri: string;
    title: string;
    artist: string;
    submissions: number;
    submitters: number;
    leagues: number;
    rounds: number;
  }>;
  diverseArtists: Array<{
    artist: string;
    submitters: number;
    submissions: number;
  }>;
  prolificSubmitters: Array<{
    playerId: string;
    playerName: string;
    submissions: number;
    artists: number;
  }>;
  longestTitles: Array<{
    title: string;
    artist: string;
    length: number;
    submitterName: string;
  }>;
  shortestTitles: Array<{
    title: string;
    artist: string;
    length: number;
    submitterName: string;
  }>;
  densestRounds: Array<{
    leagueName: string;
    leagueSlug: string;
    leagueMusicLeagueId: string | null;
    roundName: string;
    roundOrdinal: number;
    sourceRoundId: string;
    submissions: number;
    submitters: number;
  }>;
  crowdPleaserPlayers: Array<{
    playerId: string;
    playerName: string;
    songs: number;
    enteredRounds: number;
    avgPositiveReach: number;
    avgRoundPointShare: number;
    appealSpread: number;
  }>;
  nicheDevotionPlayers: Array<{
    playerId: string;
    playerName: string;
    songs: number;
    enteredRounds: number;
    avgPositiveReach: number;
    avgRoundPointShare: number;
    appealSpread: number;
  }>;
  thinSpreadSongs: Array<{
    songId: string;
    title: string;
    artist: string;
    submitterId: string;
    submitterName: string;
    leagueName: string;
    leagueSlug: string;
    leagueMusicLeagueId: string | null;
    sourceRoundId: string;
    roundName: string;
    roundOrdinal: number;
    positiveReach: number;
    roundPointShare: number;
    appealSpread: number;
    points: number;
  }>;
  cultClassicSongs: Array<{
    songId: string;
    title: string;
    artist: string;
    submitterId: string;
    submitterName: string;
    leagueName: string;
    leagueSlug: string;
    leagueMusicLeagueId: string | null;
    sourceRoundId: string;
    roundName: string;
    roundOrdinal: number;
    positiveReach: number;
    roundPointShare: number;
    appealSpread: number;
    points: number;
  }>;
  closestRaces: Array<{
    leagueName: string;
    leagueSlug: string;
    leagueMusicLeagueId: string | null;
    roundId: string;
    sourceRoundId: string;
    roundName: string;
    roundOrdinal: number;
    songs: number;
    maxRoundPointShare: number;
    topTwoShareGap: number;
    topSongs: Array<{
      title: string;
      artist: string;
      points: number;
      roundPointShare: number | null;
    }>;
  }>;
  biggestLandslides: Array<{
    leagueName: string;
    leagueSlug: string;
    leagueMusicLeagueId: string | null;
    roundId: string;
    sourceRoundId: string;
    roundName: string;
    roundOrdinal: number;
    songs: number;
    maxRoundPointShare: number;
    topTwoShareGap: number;
    topSongs: Array<{
      title: string;
      artist: string;
      points: number;
      roundPointShare: number | null;
    }>;
  }>;
  playlistPositionBias: {
    sampleSize: number;
    indexedRounds: number;
    correlationPoints: number | null;
    correlationShare: number | null;
    buckets: Array<{
      bucket: string;
      bucketMin: number;
      bucketMax: number;
      songs: number;
      avgPoints: number;
      avgRoundPointShare: number | null;
    }>;
  };
};

type SubmissionFactsPackedQueryRow = {
  mostSubmittedArtists: unknown;
  artistLoyalists: unknown;
  repeatedSongs: unknown;
  diverseArtists: unknown;
  prolificSubmitters: unknown;
  longestTitles: unknown;
  shortestTitles: unknown;
  densestRounds: unknown;
  crowdPleaserPlayers: unknown;
  nicheDevotionPlayers: unknown;
  thinSpreadSongs: unknown;
  cultClassicSongs: unknown;
  closestRaces: unknown;
  biggestLandslides: unknown;
  playlistPositionBias: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_KEY_SEPARATOR = ",";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allParams(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function canonicalIds(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(isUuid))].sort();
}

export function parseAnalyticsFilters(
  params: SearchParams,
): AnalyticsFilterRequest {
  const leagueValues = allParams(params.league);
  const explicitAllLeagues = leagueValues.includes("all");

  // Round filters are retired: scope is always all rounds in the selected leagues.
  return {
    leagueIds: explicitAllLeagues ? [] : canonicalIds(leagueValues),
    roundIds: [],
    useDefaultLeague: false,
  };
}

export function resolveAnalyticsFilter(
  request: AnalyticsFilterRequest,
  options: FilterOptions,
): AnalyticsFilter {
  const optionLeagueIds = new Set(options.leagues.map(({ id }) => id));
  const leagueIds = request.useDefaultLeague
    ? canonicalIds(options.defaultLeagueId ? [options.defaultLeagueId] : [])
    : canonicalIds(request.leagueIds.filter((id) => optionLeagueIds.has(id)));

  return { leagueIds, roundIds: [] };
}

export function parseSongSort(value: string | string[] | undefined): SongSort {
  const sort = firstParam(value);
  return songSorts.includes(sort as SongSort) ? (sort as SongSort) : "points";
}

export function parsePlayerSort(
  value: string | string[] | undefined,
): PlayerSort {
  const sort = firstParam(value);
  return playerSorts.includes(sort as PlayerSort)
    ? (sort as PlayerSort)
    : "performance";
}

export function parseRelationshipTab(
  value: string | string[] | undefined,
): RelationshipTab {
  const tab = firstParam(value);
  return relationshipTabs.includes(tab as RelationshipTab)
    ? (tab as RelationshipTab)
    : "received";
}

export function parseRelationshipSort(
  value: string | string[] | undefined,
  tab: RelationshipTab,
): RelationshipSort {
  const sort = firstParam(value);
  if (relationshipSorts.includes(sort as RelationshipSort)) {
    return sort as RelationshipSort;
  }
  if (tab === "alignment") return "alignment";
  if (tab === "timing") return "timing";
  if (tab === "mutual") return "share";
  return "rate";
}

export function defaultPlayerSortDirection(sort: PlayerSort): SortDirection {
  return sort === "name" ? "asc" : "desc";
}

export function defaultRelationshipSortDirection(
  sort: RelationshipSort,
): SortDirection {
  return sort === "player" || sort === "missed" ? "asc" : "desc";
}

export function parseSongSortDirection(
  value: string | string[] | undefined,
  sort: SongSort,
): SortDirection {
  const direction = firstParam(value);
  return sortDirections.includes(direction as SortDirection)
    ? (direction as SortDirection)
    : defaultSongSortDirection(sort);
}

export function parsePlayerSortDirection(
  value: string | string[] | undefined,
  sort: PlayerSort,
): SortDirection {
  const direction = firstParam(value);
  return sortDirections.includes(direction as SortDirection)
    ? (direction as SortDirection)
    : defaultPlayerSortDirection(sort);
}

export function parseRelationshipSortDirection(
  value: string | string[] | undefined,
  sort: RelationshipSort,
): SortDirection {
  const direction = firstParam(value);
  return sortDirections.includes(direction as SortDirection)
    ? (direction as SortDirection)
    : defaultRelationshipSortDirection(sort);
}

export function parseFocusPlayerId(
  value: string | string[] | undefined,
): string | null {
  const focus = firstParam(value);
  return isUuid(focus) ? focus : null;
}

export function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export function parseSearch(value: string | string[] | undefined): string {
  return (firstParam(value) ?? "").trim().slice(0, 100);
}

export {
  buildAnalyticsHref,
  type QueryValue,
} from "@/lib/analytics-url";
import type { QueryValue } from "@/lib/analytics-url";

export function scopeQueryParams(
  filter: AnalyticsFilter,
): Pick<Record<string, QueryValue>, "league"> {
  return {
    league: filter.leagueIds.length ? filter.leagueIds : "all",
  };
}

/** Canonical mat/combo scope key: "all", a single league uuid, or sorted uuids joined by ",". */
export function analyticsScopeKey(leagueIds: readonly string[]): string {
  const ids = canonicalIds(leagueIds);
  return ids.length ? ids.join(SCOPE_KEY_SEPARATOR) : "all";
}

export function encodeScopeIds(ids: readonly string[]): string {
  return canonicalIds(ids).join(SCOPE_KEY_SEPARATOR);
}

function decodeScopeIds(key: string): string[] {
  return canonicalIds(key ? key.split(SCOPE_KEY_SEPARATOR) : []);
}

export function safeRatio(
  numerator: number,
  denominator: number,
): number | null {
  return Number.isFinite(numerator) &&
    Number.isFinite(denominator) &&
    denominator > 0
    ? numerator / denominator
    : null;
}

/** Minimum entered rounds to qualify for round-adjusted rankings (~1/3 of scope, at least 1). */
export function qualificationRoundFloor(scopeRounds: number): number {
  if (!Number.isFinite(scopeRounds) || scopeRounds <= 0) return 1;
  return Math.max(1, Math.ceil(scopeRounds / 3));
}

export function supportIndex(
  songPoints: number,
  expectedPoints: number,
): number | null {
  return safeRatio(songPoints, expectedPoints);
}

/** Minimum songs per expected-point bin when estimating SI variance components. */
const SI_VARIANCE_BIN_MIN_N = 20;

export type SupportIndexVarianceComponents = {
  phi: number;
  tau2: number;
};

/**
 * Estimate Var(SI) ≈ τ² + φ/E from binned method-of-moments regression.
 * Used for empirical-Bayes shrinkage and support z-scores.
 */
export function estimateSupportIndexVarianceComponents(
  songs: readonly { supportIndex: number; expectedPoints: number }[],
): SupportIndexVarianceComponents | null {
  const edges = [0, 10, 12, 14, 16, 18, 20, 22, 25, Number.POSITIVE_INFINITY];
  const bins: { invE: number; varSI: number }[] = [];

  for (let i = 0; i < edges.length - 1; i += 1) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const values = songs.filter(
      (song) =>
        Number.isFinite(song.supportIndex) &&
        Number.isFinite(song.expectedPoints) &&
        song.expectedPoints > 0 &&
        song.expectedPoints >= lo &&
        song.expectedPoints < hi,
    );
    if (values.length < SI_VARIANCE_BIN_MIN_N) continue;
    const meanE =
      values.reduce((sum, song) => sum + song.expectedPoints, 0) / values.length;
    const meanSi =
      values.reduce((sum, song) => sum + song.supportIndex, 0) / values.length;
    const varSI =
      values.reduce(
        (sum, song) => sum + (song.supportIndex - meanSi) ** 2,
        0,
      ) /
      (values.length - 1);
    if (!(meanE > 0) || !Number.isFinite(varSI)) continue;
    bins.push({ invE: 1 / meanE, varSI });
  }

  if (bins.length < 2) return null;

  const n = bins.length;
  const meanX = bins.reduce((sum, bin) => sum + bin.invE, 0) / n;
  const meanY = bins.reduce((sum, bin) => sum + bin.varSI, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const bin of bins) {
    cov += (bin.invE - meanX) * (bin.varSI - meanY);
    varX += (bin.invE - meanX) ** 2;
  }
  if (!(varX > 0)) return null;
  const phi = Math.max(0.01, cov / varX);
  const tau2 = Math.max(0, meanY - phi * meanX);
  return { phi, tau2 };
}

/** Empirical-Bayes shrunk support index toward 1.0 using Var(SI)=τ²+φ/E. */
export function supportIndexEb(
  songSupportIndex: number | null,
  expectedPoints: number,
  components: SupportIndexVarianceComponents,
): number | null {
  if (
    songSupportIndex === null ||
    !Number.isFinite(songSupportIndex) ||
    !Number.isFinite(expectedPoints) ||
    expectedPoints <= 0
  ) {
    return null;
  }
  const { phi, tau2 } = components;
  // Without a positive prior variance, shrinking would collapse every song to 1.0×.
  // Prefer the raw index over that degenerate result.
  if (!(phi > 0) || !(tau2 > 0)) return songSupportIndex;
  const samplingVar = phi / expectedPoints;
  const weight = tau2 / (tau2 + samplingVar);
  return 1 + (songSupportIndex - 1) * weight;
}

/** Standardized surplus vs expected points under quasi-Poisson Var=φ·E. */
export function supportZ(
  songPoints: number,
  expectedPoints: number,
  phi: number,
): number | null {
  if (
    !Number.isFinite(songPoints) ||
    !Number.isFinite(expectedPoints) ||
    !Number.isFinite(phi) ||
    expectedPoints <= 0 ||
    phi <= 0
  ) {
    return null;
  }
  return (songPoints - expectedPoints) / Math.sqrt(phi * expectedPoints);
}

export function percentileRank(values: number[], value: number): number | null {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finiteValues.length || !Number.isFinite(value)) return null;
  if (finiteValues.length === 1) return 100;
  const belowOrEqual = finiteValues.filter((candidate) => candidate <= value).length;
  return ((belowOrEqual - 1) / (finiteValues.length - 1)) * 100;
}

export function timingMidpointPercentile({
  ballotRank,
  observedVoters,
  tieCount = 1,
}: {
  ballotRank: number;
  observedVoters: number;
  tieCount?: number;
}): number | null {
  if (
    !Number.isFinite(ballotRank) ||
    !Number.isFinite(observedVoters) ||
    !Number.isFinite(tieCount) ||
    observedVoters <= 0 ||
    ballotRank <= 0 ||
    tieCount <= 0
  ) {
    return null;
  }
  if (observedVoters === 1) return 0.5;
  return (ballotRank - 1 + tieCount / 2) / observedVoters;
}

export function cosineSimilarity(
  left: number[],
  right: number[],
): number | null {
  if (!left.length || left.length !== right.length) return null;
  let dot = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
    dot += leftValue * rightValue;
    leftSquare += leftValue * leftValue;
    rightSquare += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator > 0 ? dot / denominator : null;
}

export function spotifyTrackUrl(uri: string): string | null {
  const match = /^spotify:track:([A-Za-z0-9]+)$/.exec(uri);
  return match ? `https://open.spotify.com/track/${match[1]}` : null;
}

export function isoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Analytics query returned an invalid timestamp.");
  }
  return date.toISOString();
}

export async function loadAnalytics<T>(
  loader: () => Promise<T>,
): Promise<AnalyticsLoad<T>> {
  if (!process.env.DATABASE_URL) return { status: "setup" };
  try {
    const [row] = await db.execute<{
      status: string | null;
      summary: unknown;
    }>(sql`
      select status, summary
      from analytics_materialization_jobs
      where analytics_revision = ${ANALYTICS_REVISION}
      order by created_at desc
      limit 1
    `);
    if (row?.status === "processing" || row?.status === "pending") {
      const summary = row.summary as {
        kind?: string;
        stepLabel?: string;
        stepIndex?: number;
        stepCount?: number;
      } | null;
      const progressLabel =
        summary?.kind === "progress" && summary.stepLabel
          ? `${summary.stepLabel} (${(summary.stepIndex ?? 0) + 1}/${summary.stepCount ?? 1})`
          : row.status === "pending"
            ? "Waiting to start analytics refresh…"
            : "Refreshing analytics cache…";
      return { status: "building", progressLabel };
    }
    if (row?.status !== "completed") {
      return {
        status: "building",
        progressLabel:
          "Analytics cache is not ready. An admin needs to run Refresh all-leagues stats.",
      };
    }
    return { status: "ready", data: await loader() };
  } catch (error) {
    const cause =
      typeof error === "object" && error !== null && "cause" in error
        ? error.cause
        : null;
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            typeof cause.code === "string"
          ? cause.code
        : "UNKNOWN";
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error(`Public analytics query failed (${kind}/${code}).`);
    return { status: "unavailable" };
  }
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const [leagueRows, roundRows] = await Promise.all([
    db
      .select({
        id: leagues.id,
        name: leagues.name,
        slug: leagues.slug,
        musicLeagueId: leagues.musicLeagueId,
      })
      .from(leagues)
      .orderBy(
        sql`${leagues.startDate} desc nulls last`,
        sql`${leagues.createdAt} desc`,
        asc(leagues.name),
      ),
    db
      .select({
        id: rounds.id,
        leagueId: rounds.leagueId,
        leagueName: leagues.name,
        leagueMusicLeagueId: leagues.musicLeagueId,
        sourceRoundId: rounds.sourceRoundId,
        name: rounds.name,
        ordinal: rounds.ordinal,
      })
      .from(rounds)
      .innerJoin(leagues, eq(rounds.leagueId, leagues.id))
      .orderBy(asc(leagues.name), asc(rounds.ordinal)),
  ]);

  return {
    defaultLeagueId: leagueRows[0]?.id ?? null,
    leagues: [...leagueRows].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    rounds: roundRows,
  };
}

function inCondition(column: SQL, values: readonly string[]): SQL | null {
  const ids = canonicalIds(values);
  return ids.length
    ? sql`(${sql.join(
        ids.map((id) => sql`${column} = ${id}`),
        sql` or `,
      )})`
    : null;
}

function scopePredicate(filter: AnalyticsFilter, alias: "r" | "rounds" = "r"): SQL {
  const leagueColumn =
    alias === "r" ? sql`r.league_id` : sql`rounds.league_id`;
  const roundColumn = alias === "r" ? sql`r.id` : sql`rounds.id`;
  const conditions: SQL[] = [];
  const leagueCondition = inCondition(leagueColumn, filter.leagueIds);
  const roundCondition = inCondition(roundColumn, filter.roundIds);
  if (leagueCondition) conditions.push(leagueCondition);
  if (roundCondition) conditions.push(roundCondition);
  return conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
}

function selectedRoundsCte(filter: AnalyticsFilter): SQL {
  return sql`
    selected_rounds as (
      select
        r.id,
        r.league_id,
        r.source_round_id,
        r.ordinal,
        r.name,
        r.source_created_at
      from rounds r
      where ${scopePredicate(filter)}
    )
  `;
}

function selectedLeaguesCte(filter: AnalyticsFilter): SQL {
  const conditions: SQL[] = [];
  const leagueCondition = inCondition(sql`l.id`, filter.leagueIds);
  if (leagueCondition) conditions.push(leagueCondition);
  if (filter.roundIds.length) {
    conditions.push(
      sql`exists (select 1 from selected_rounds scope_round where scope_round.league_id = l.id)`,
    );
  }
  return sql`
    selected_leagues as (
      select l.id from leagues l
      where ${conditions.length ? sql.join(conditions, sql` and `) : sql`true`}
    )
  `;
}

export function competitorDisplayName(alias = "c"): SQL {
  return sql.raw(`coalesce(${alias}.name_override, ${alias}.name)`);
}

export function voteOpportunityCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${selectedRoundsCte(filter)},
    scope_thresholds as (
      select
        count(*)::int as scope_rounds,
        greatest(1, ceil(count(*)::numeric / 3)::int) as minimum_shared_rounds,
        least(
          20,
          greatest(5, ceil(count(*)::numeric / 3)::int * 5)
        )::int as minimum_comparable_features
      from selected_rounds
    ),
    active_ballots as (
      select
        v.round_id,
        v.league_id,
        v.voter_id,
        max(v.cast_at) as cast_at
      from votes v
      join selected_rounds sr on sr.id = v.round_id
      group by v.round_id, v.league_id, v.voter_id
    ),
    round_scored_submissions as (
      select
        s.id,
        s.league_id,
        s.round_id,
        s.submitter_id
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      where s.visible_to_voters
         or exists (
          select 1
          from votes scoped_vote
          where scoped_vote.submission_id = s.id
        )
    ),
    eligible_vote_opportunities as (
      select
        rss.id as submission_id,
        rss.league_id,
        rss.round_id,
        rss.submitter_id,
        ab.voter_id
      from active_ballots ab
      join round_scored_submissions rss on rss.round_id = ab.round_id
      where rss.submitter_id <> ab.voter_id
    ),
    effective_votes as (
      select
        evo.submission_id,
        evo.league_id,
        evo.round_id,
        evo.submitter_id,
        evo.voter_id,
        coalesce(v.points, 0)::int as points,
        (v.id is not null) as explicit
      from eligible_vote_opportunities evo
      left join votes v
        on v.round_id = evo.round_id
       and v.submission_id = evo.submission_id
       and v.voter_id = evo.voter_id
    ),
    ballot_totals as (
      select
        ev.round_id,
        ev.voter_id,
        sum(ev.points)::double precision as ballot_points,
        count(*)::int as eligible_opportunities
      from effective_votes ev
      group by ev.round_id, ev.voter_id
    )
  `;
}

export function songStatsCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${voteOpportunityCtes(filter)},
    round_submission_totals as (
      select sr.id as round_id, count(s.id) filter (
        where s.visible_to_voters
           or exists (
            select 1
            from votes scoped_vote
            where scoped_vote.submission_id = s.id
          )
      )::int as slate_count
      from selected_rounds sr
      left join submissions s on s.round_id = sr.id
      group by sr.id
    ),
    round_vote_totals as (
      select sr.id as round_id, coalesce(sum(ev.points), 0)::int as round_points
      from selected_rounds sr
      left join effective_votes ev on ev.round_id = sr.id
      group by sr.id
    ),
    submission_vote_stats as (
      select
        s.id as submission_id,
        coalesce(sum(ev.points), 0)::int as points,
        coalesce(sum(
          case
            when bt.eligible_opportunities > 0
              then bt.ballot_points / bt.eligible_opportunities
            else null
          end
        ), 0)::double precision as expected_points,
        count(ev.submission_id)::int as eligible_rows,
        count(ev.submission_id) filter (where ev.points > 0)::int as positive_rows
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      left join effective_votes ev on ev.submission_id = s.id
      left join ballot_totals bt
        on bt.round_id = ev.round_id
       and bt.voter_id = ev.voter_id
      group by s.id
    ),
    song_stats as (
      select
        s.id,
        s.league_id,
        s.round_id,
        s.submitter_id,
        s.spotify_uri,
        s.song_title,
        s.artist_name,
        s.album_name,
        s.submitted_at,
        sr.ordinal as round_ordinal,
        sr.source_round_id,
        sr.name as round_name,
        svs.points,
        svs.expected_points,
        svs.eligible_rows,
        svs.positive_rows,
        rst.slate_count,
        rvt.round_points,
        case when svs.eligible_rows > 0
          then svs.points::double precision / svs.eligible_rows else null end as points_per_eligible_voter,
        case when svs.eligible_rows > 0
          then svs.positive_rows::double precision / svs.eligible_rows else null end as positive_reach,
        case when rvt.round_points > 0
          then svs.points::double precision / rvt.round_points else null end as round_point_share,
        case when svs.expected_points > 0
          then svs.points::double precision / svs.expected_points else null end as support_index
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      join submission_vote_stats svs on svs.submission_id = s.id
      join round_submission_totals rst on rst.round_id = sr.id
      join round_vote_totals rvt on rvt.round_id = sr.id
    ),
    si_bins as (
      select
        avg(expected_points)::double precision as mean_e,
        (1.0 / nullif(avg(expected_points), 0))::double precision as inv_e,
        var_samp(support_index)::double precision as var_si,
        count(*)::int as n
      from song_stats
      where support_index is not null
        and expected_points > 0
      group by case
        when expected_points < 10 then 0
        when expected_points < 12 then 1
        when expected_points < 14 then 2
        when expected_points < 16 then 3
        when expected_points < 18 then 4
        when expected_points < 20 then 5
        when expected_points < 22 then 6
        when expected_points < 25 then 7
        else 8
      end
      having count(*) >= 20
        and avg(expected_points) > 0
        and var_samp(support_index) is not null
    ),
    si_regression as (
      select
        count(*)::int as bin_count,
        (
          count(*)::double precision * sum(inv_e * var_si)
          - sum(inv_e) * sum(var_si)
        ) / nullif(
          count(*)::double precision * sum(inv_e * inv_e)
          - sum(inv_e) * sum(inv_e),
          0
        ) as phi,
        avg(var_si) - (
          (
            count(*)::double precision * sum(inv_e * var_si)
            - sum(inv_e) * sum(var_si)
          ) / nullif(
            count(*)::double precision * sum(inv_e * inv_e)
            - sum(inv_e) * sum(inv_e),
            0
          )
        ) * avg(inv_e) as tau2
      from si_bins
    ),
    si_params as (
      select
        phi_resolved.phi,
        -- Prefer binned regression τ² when at least two bins exist. Otherwise use
        -- method-of-moments τ². Never coerce a missing fit to 0: that would make
        -- every supportIndexEb collapse to 1.0×.
        greatest(
          0::double precision,
          coalesce(
            case
              when coalesce(reg.bin_count, 0) >= 2 then reg.tau2
            end,
            mom.tau2
          )
        )::double precision as tau2
      from (
        select greatest(
          0.01::double precision,
          coalesce(reg.phi, fallback.phi, 1.0::double precision)
        )::double precision as phi
        from (select 1) as seed
        left join si_regression reg on true
        left join (
          select avg(
            (ss.points - ss.expected_points)
            * (ss.points - ss.expected_points)
            / nullif(ss.expected_points, 0)
          )::double precision as phi
          from song_stats ss
          where ss.support_index is not null
            and ss.expected_points > 0
        ) fallback on true
      ) phi_resolved
      left join si_regression reg on true
      left join lateral (
        select greatest(
          0::double precision,
          avg(
            (ss.support_index - 1::double precision)
            * (ss.support_index - 1::double precision)
            - phi_resolved.phi / nullif(ss.expected_points, 0)
          )
        )::double precision as tau2
        from song_stats ss
        where ss.support_index is not null
          and ss.expected_points > 0
      ) mom on true
    )
  `;
}

type DashboardSummaryRow = {
  leagueCount: number;
  roundCount: number;
  playerCount: number;
  songCount: number;
  pointCount: number;
};

type DashboardCoreQueryRow = DashboardSummaryRow & {
  leaderboard: unknown;
  topSongs: unknown;
  distribution: unknown;
};

type LeaderboardQueryRow = {
  id: string;
  name: string;
  totalPoints: number;
  normalizedIndex: number | null;
  enteredRounds: number;
};

type SongQueryRow = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  spotifyUri: string;
  submitterId: string;
  submitterName: string;
  leagueId: string;
  leagueName: string;
  leagueSlug: string;
  leagueMusicLeagueId: string | null;
  roundId: string;
  sourceRoundId: string;
  roundName: string;
  roundOrdinal: number;
  submittedAt: Date | string;
  points: number;
  expectedPoints: number;
  eligibleRows: number;
  positiveRows: number;
  pointsPerEligibleVoter: number | null;
  positiveReach: number | null;
  roundPointShare: number | null;
  supportIndex: number | null;
  supportIndexEb: number | null;
  supportZ: number | null;
  performancePercentile: number | null;
};

type SongsPackedQueryRow = {
  totalCount: number;
  rows: unknown;
};

function jsonRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") return JSON.parse(value) as T[];
  return [];
}

function mapSong(row: SongQueryRow): SongAnalyticsRow {
  return {
    ...row,
    spotifyUrl: spotifyTrackUrl(row.spotifyUri),
    submittedAt: isoTimestamp(row.submittedAt),
  };
}

export function songSelect(): SQL {
  return sql`
    select
      ss.id,
      ss.song_title as "title",
      ss.artist_name as "artist",
      ss.album_name as "album",
      ss.spotify_uri as "spotifyUri",
      ss.submitter_id as "submitterId",
      ${competitorDisplayName("c")} as "submitterName",
      ss.league_id as "leagueId",
      l.name as "leagueName",
      l.slug as "leagueSlug",
      l.music_league_id as "leagueMusicLeagueId",
      ss.round_id as "roundId",
      ss.source_round_id as "sourceRoundId",
      ss.round_name as "roundName",
      ss.round_ordinal as "roundOrdinal",
      ss.submitted_at as "submittedAt",
      ss.points,
      ss.expected_points as "expectedPoints",
      ss.eligible_rows as "eligibleRows",
      ss.positive_rows as "positiveRows",
      ss.points_per_eligible_voter as "pointsPerEligibleVoter",
      ss.positive_reach as "positiveReach",
      ss.round_point_share as "roundPointShare",
      ss.support_index as "supportIndex",
      case
        when ss.support_index is null or ss.expected_points <= 0 then null::double precision
        -- No usable prior variance: keep raw SI instead of collapsing every song to 1.0×.
        when sp.tau2 <= 0 then ss.support_index
        else 1::double precision + (ss.support_index - 1::double precision) * (
          sp.tau2 / (sp.tau2 + sp.phi / ss.expected_points)
        )
      end as "supportIndexEb",
      case
        when ss.expected_points <= 0 then null::double precision
        else (ss.points - ss.expected_points)
          / nullif(sqrt(sp.phi * ss.expected_points), 0)
      end as "supportZ",
      case
        when ss.support_index is null then null::double precision
        when count(ss.support_index) over (partition by ss.round_id) = 1
          then 100::double precision
        else (
          rank() over (partition by ss.round_id order by ss.support_index asc nulls last) - 1
        )::double precision / (
          count(ss.support_index) over (partition by ss.round_id) - 1
        ) * 100
      end as "performancePercentile"
    from song_stats ss
    cross join si_params sp
    join competitors c on c.id = ss.submitter_id
    join leagues l on l.id = ss.league_id
  `;
}

export function alignmentComparisonTailCtes(playerId?: string): SQL {
  const pairScopeFilter = playerId
    ? sql`where lm1.competitor_id = ${playerId} or lm2.competitor_id = ${playerId}`
    : sql``;
  return sql`
    pair_scope as (
      select
        lm1.competitor_id as left_id,
        lm2.competitor_id as right_id,
        count(distinct sr.id)::int as scope_rounds
      from selected_rounds sr
      join league_members lm1 on lm1.league_id = sr.league_id
      join league_members lm2
        on lm2.league_id = sr.league_id
       and lm2.competitor_id > lm1.competitor_id
      ${pairScopeFilter}
      group by lm1.competitor_id, lm2.competitor_id
    ),
    shared_ballot_pairs as (
      select
        left_ballot.round_id,
        left_ballot.voter_id as left_id,
        right_ballot.voter_id as right_id,
        ps.scope_rounds
      from active_ballots left_ballot
      join active_ballots right_ballot
        on right_ballot.round_id = left_ballot.round_id
       and right_ballot.voter_id > left_ballot.voter_id
      join pair_scope ps
        on ps.left_id = left_ballot.voter_id
       and ps.right_id = right_ballot.voter_id
    ),
    third_party_features as (
      select
        sp.left_id,
        sp.right_id,
        sp.round_id,
        sp.scope_rounds,
        ev_left.submission_id::text as feature_key,
        ev_left.points::double precision / nullif(left_total.ballot_points, 0) as left_value,
        ev_right.points::double precision / nullif(right_total.ballot_points, 0) as right_value
      from shared_ballot_pairs sp
      join effective_votes ev_left
        on ev_left.round_id = sp.round_id
       and ev_left.voter_id = sp.left_id
      join effective_votes ev_right
        on ev_right.round_id = sp.round_id
       and ev_right.voter_id = sp.right_id
       and ev_right.submission_id = ev_left.submission_id
      join ballot_totals left_total
        on left_total.round_id = sp.round_id
       and left_total.voter_id = sp.left_id
      join ballot_totals right_total
        on right_total.round_id = sp.round_id
       and right_total.voter_id = sp.right_id
      where ev_left.submitter_id <> sp.left_id
        and ev_left.submitter_id <> sp.right_id
        and left_total.ballot_points > 0
        and right_total.ballot_points > 0
    ),
    mutual_support_points as (
      select
        sp.left_id,
        sp.right_id,
        sp.round_id,
        sp.scope_rounds,
        coalesce(sum(ev.points) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        ), 0)::double precision as left_points,
        coalesce(sum(ev.points) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        ), 0)::double precision as right_points,
        count(ev.submission_id) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        )::int as left_opportunities,
        count(ev.submission_id) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        )::int as right_opportunities
      from shared_ballot_pairs sp
      left join effective_votes ev
        on ev.round_id = sp.round_id
       and (
        (ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id)
        or (ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id)
       )
      group by sp.left_id, sp.right_id, sp.round_id, sp.scope_rounds
      having count(ev.submission_id) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        ) > 0
         and count(ev.submission_id) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        ) > 0
    ),
    mutual_features as (
      select
        msp.left_id,
        msp.right_id,
        msp.round_id,
        msp.scope_rounds,
        ('mutual:' || msp.round_id::text) as feature_key,
        msp.left_points / nullif(left_total.ballot_points, 0) as left_value,
        msp.right_points / nullif(right_total.ballot_points, 0) as right_value
      from mutual_support_points msp
      join ballot_totals left_total
        on left_total.round_id = msp.round_id
       and left_total.voter_id = msp.left_id
      join ballot_totals right_total
        on right_total.round_id = msp.round_id
       and right_total.voter_id = msp.right_id
      where left_total.ballot_points > 0
        and right_total.ballot_points > 0
    ),
    comparison_features as (
      select * from third_party_features
      union all
      select * from mutual_features
    ),
    pair_comparisons as (
      select
        cf.left_id,
        cf.right_id,
        count(*)::int as comparable_features,
        count(distinct cf.round_id)::int as shared_rounds,
        max(cf.scope_rounds)::int as scope_rounds,
        sum(cf.left_value * cf.right_value) as dot,
        sqrt(sum(cf.left_value * cf.left_value) * sum(cf.right_value * cf.right_value)) as magnitude
      from comparison_features cf
      group by cf.left_id, cf.right_id
      having count(*) >= (
          select minimum_comparable_features from scope_thresholds
        )
         and count(distinct cf.round_id) >= (
          select minimum_shared_rounds from scope_thresholds
        )
    )
  `;
}

export function alignmentComparisonCtes(
  filter: AnalyticsFilter,
  playerId?: string,
): SQL {
  return sql`${voteOpportunityCtes(filter)}, ${alignmentComparisonTailCtes(playerId)}`;
}

export function isAllLeaguesScope(filter: AnalyticsFilter): boolean {
  return filter.leagueIds.length === 0 && filter.roundIds.length === 0;
}

export function isSingleLeagueScope(filter: AnalyticsFilter): boolean {
  return filter.leagueIds.length === 1 && filter.roundIds.length === 0;
}

export function isMultiLeagueScope(filter: AnalyticsFilter): boolean {
  return filter.leagueIds.length > 1 && filter.roundIds.length === 0;
}

export function canUseSongDerivedMats(filter: AnalyticsFilter): boolean {
  return filter.roundIds.length === 0;
}

async function hasCompletedAllLeaguesMaterialization(): Promise<boolean> {
  const [row] = await db.execute<{ status: string | null }>(sql`
    select status
    from analytics_materialization_jobs
    where analytics_revision = ${ANALYTICS_REVISION}
    order by created_at desc
    limit 1
  `);
  return row?.status === "completed";
}

async function hasCompletedScopeMaterialization(scopeKey: string): Promise<boolean> {
  if (scopeKey === "all" || !scopeKey.includes(",")) {
    return hasCompletedAllLeaguesMaterialization();
  }
  const [row] = await db.execute<{ status: string | null }>(sql`
    select status
    from analytics_scope_jobs
    where analytics_revision = ${ANALYTICS_REVISION}
      and scope_key = ${scopeKey}
    order by created_at desc
    limit 1
  `);
  return row?.status === "completed";
}

async function countScopeRounds(filter: AnalyticsFilter): Promise<number> {
  if (filter.leagueIds.length === 0) {
    const [row] = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from rounds
    `);
    return row?.count ?? 0;
  }
  const [row] = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from rounds
    where league_id in (${sql.join(
      filter.leagueIds.map((id) => sql`${id}`),
      sql`, `,
    )})
  `);
  return row?.count ?? 0;
}

function matSongSelect(leagueIds: readonly string[] = []): SQL {
  const leagueFilter =
    leagueIds.length > 0
      ? sql`where league_id in (${sql.join(
          leagueIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  return sql`
    select
      id,
      title,
      artist,
      album,
      spotify_uri as "spotifyUri",
      submitter_id as "submitterId",
      submitter_name as "submitterName",
      league_id as "leagueId",
      league_name as "leagueName",
      league_slug as "leagueSlug",
      league_music_league_id as "leagueMusicLeagueId",
      round_id as "roundId",
      source_round_id as "sourceRoundId",
      round_name as "roundName",
      round_ordinal as "roundOrdinal",
      submitted_at as "submittedAt",
      points,
      expected_points as "expectedPoints",
      eligible_rows as "eligibleRows",
      positive_rows as "positiveRows",
      points_per_eligible_voter as "pointsPerEligibleVoter",
      positive_reach as "positiveReach",
      round_point_share as "roundPointShare",
      support_index as "supportIndex",
      support_index_eb as "supportIndexEb",
      support_z as "supportZ",
      performance_percentile as "performancePercentile"
    from analytics_song_stats
    ${leagueFilter}
  `;
}

async function getMaterializedDashboardData(
  filter: AnalyticsFilter,
): Promise<DashboardData> {
  const scopeKey = analyticsScopeKey(filter.leagueIds);
  const leagueIds = filter.leagueIds;
  const songSource = matSongSelect(leagueIds);
  const leagueCountSql =
    leagueIds.length > 0
      ? sql`(select count(*)::int from leagues where id in (${sql.join(
          leagueIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`
      : sql`(select count(*)::int from leagues)`;
  const roundCountSql =
    leagueIds.length > 0
      ? sql`(select count(*)::int from rounds where league_id in (${sql.join(
          leagueIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`
      : sql`(select count(*)::int from rounds)`;
  const playerCountSql =
    leagueIds.length > 0
      ? sql`(select count(distinct competitor_id)::int from league_members where league_id in (${sql.join(
          leagueIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`
      : sql`(select count(distinct competitor_id)::int from league_members)`;

  const useEagerPlayers = scopeKey === "all" || !scopeKey.includes(",");
  const [row] = await db.execute<DashboardCoreQueryRow>(sql`
    with ranked_songs as (${songSource}),
    summary_row as (
      select
        ${leagueCountSql} as "leagueCount",
        ${roundCountSql} as "roundCount",
        ${playerCountSql} as "playerCount",
        (select count(*)::int from ranked_songs) as "songCount",
        coalesce(
          (select sum(points * count)::int from analytics_point_distribution where scope_key = ${scopeKey}),
          (
            select coalesce(sum(ss.points), 0)::int from ranked_songs ss
          )
        ) as "pointCount"
    ),
    leaderboard_rows as (
      ${
        useEagerPlayers
          ? sql`
      select
        id,
        name,
        total_points as "totalPoints",
        average_round_index as "normalizedIndex",
        entered_rounds as "enteredRounds"
      from analytics_player_stats
      where scope_key = ${scopeKey}
      order by total_points desc, name asc
      limit 100
          `
          : sql`
      select
        "submitterId" as id,
        min("submitterName") as name,
        sum(points)::int as "totalPoints",
        avg("supportIndex") as "normalizedIndex",
        count(distinct "roundId")::int as "enteredRounds"
      from ranked_songs
      group by "submitterId"
      order by "totalPoints" desc, name asc
      limit 100
          `
      }
    ),
    top_song_rows as (
      select * from ranked_songs
      order by "supportIndexEb" desc nulls last, "supportIndex" desc nulls last, points desc, title asc
      limit 10
    ),
    distribution_rows as (
      ${
        useEagerPlayers
          ? sql`
      select points, count
      from analytics_point_distribution
      where scope_key = ${scopeKey}
      order by points
          `
          : sql`
      select points, sum(count)::int as count
      from analytics_point_distribution
      where scope_key in (${sql.join(
        leagueIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      group by points
      order by points
          `
      }
    )
    select
      summary_row.*,
      (
        select coalesce(
          json_agg(to_jsonb(leaderboard_rows) order by "totalPoints" desc, name asc),
          '[]'::json
        )
        from leaderboard_rows
      ) as leaderboard,
      (
        select coalesce(
          json_agg(
            to_jsonb(top_song_rows)
            order by "supportIndexEb" desc nulls last, "supportIndex" desc nulls last, points desc, title asc
          ),
          '[]'::json
        )
        from top_song_rows
      ) as "topSongs",
      (
        select coalesce(json_agg(to_jsonb(distribution_rows) order by points), '[]'::json)
        from distribution_rows
      ) as distribution
    from summary_row
  `);

  return {
    alignment: await getMaterializedDashboardAlignmentData(scopeKey),
    leaderboard: jsonRows<LeaderboardQueryRow>(row?.leaderboard),
    pointDistribution: createPointDistribution(
      jsonRows<{ points: number; count: number }>(row?.distribution),
    ),
    summary: {
      leagues: row?.leagueCount ?? 0,
      points: row?.pointCount ?? 0,
      players: row?.playerCount ?? 0,
      rounds: row?.roundCount ?? 0,
      songs: row?.songCount ?? 0,
    },
    topSongs: jsonRows<SongQueryRow>(row?.topSongs).map(mapSong),
  };
}

async function getMaterializedDashboardAlignmentData(
  scopeKey: string,
): Promise<DashboardData["alignment"]> {
  const rows = await db.execute<DashboardData["alignment"][number]>(sql`
    select
      left_id as "leftId",
      left_name as "leftName",
      right_id as "rightId",
      right_name as "rightName",
      alignment,
      comparable_features as "comparableFeatures",
      shared_rounds as "sharedRounds",
      scope_rounds as "scopeRounds"
    from analytics_relationship_alignment
    where scope_key = ${scopeKey}
    order by alignment desc, comparable_features desc
    limit 3
  `);
  return rows;
}

export async function getDashboardData(
  filter: AnalyticsFilter,
): Promise<DashboardData> {
  if (
    canUseSongDerivedMats(filter) &&
    (await hasCompletedAllLeaguesMaterialization())
  ) {
    const scopeKey = analyticsScopeKey(filter.leagueIds);
    // Multi-league dashboard: songs/players/dist from mats; alignment only if combo cached.
    if (isMultiLeagueScope(filter) && !(await hasCompletedScopeMaterialization(scopeKey))) {
      const data = await getMaterializedDashboardData(filter);
      return { ...data, alignment: [] };
    }
    return getMaterializedDashboardData(filter);
  }

  const rows = await db.execute<DashboardCoreQueryRow>(sql`
    with ${songStatsCtes(filter)}, ${selectedLeaguesCte(filter)},
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        sum(expected_points)::double precision as expected_points
      from song_stats
      group by submitter_id, round_id
    ),
    leaderboard_rows as (
      select
        c.id,
        ${competitorDisplayName("c")} as name,
        sum(pr.points)::int as "totalPoints",
        avg(case when pr.expected_points > 0
          then pr.points::double precision / pr.expected_points else null end) as "normalizedIndex",
        count(*)::int as "enteredRounds"
      from player_round pr
      join competitors c on c.id = pr.submitter_id
      group by c.id, c.name_override, c.name
      order by "totalPoints" desc, name asc
      limit 100
    ),
    ranked_songs as (${songSelect()}),
    top_song_rows as (
      select * from ranked_songs
      order by "supportIndexEb" desc nulls last, "supportIndex" desc nulls last, points desc, title asc
      limit 10
    ),
    distribution_rows as (
      select ev.points, count(*)::int as count
      from effective_votes ev
      group by ev.points
      order by ev.points
    )
    select
      (select count(*)::int from selected_leagues) as "leagueCount",
      (select count(*)::int from selected_rounds) as "roundCount",
      (select count(distinct lm.competitor_id)::int from league_members lm join selected_leagues sl on sl.id = lm.league_id) as "playerCount",
      (select count(s.id)::int from submissions s join selected_rounds sr on sr.id = s.round_id) as "songCount",
      (select coalesce(sum(ev.points), 0)::int from effective_votes ev) as "pointCount",
      (select coalesce(json_agg(to_jsonb(leaderboard_rows) order by "totalPoints" desc, name asc), '[]'::json) from leaderboard_rows) as leaderboard,
      (select coalesce(json_agg(to_jsonb(top_song_rows) order by "supportIndexEb" desc nulls last, "supportIndex" desc nulls last, points desc, title asc), '[]'::json) from top_song_rows) as "topSongs",
      (select coalesce(json_agg(to_jsonb(distribution_rows) order by points), '[]'::json) from distribution_rows) as distribution
  `);
  const row = rows[0] ?? {
    leagueCount: 0,
    roundCount: 0,
    playerCount: 0,
    songCount: 0,
    pointCount: 0,
    leaderboard: [],
    topSongs: [],
    distribution: [],
  };
  const leaderboard = jsonRows<LeaderboardQueryRow>(row.leaderboard);
  const topSongs = jsonRows<SongQueryRow>(row.topSongs);
  const distribution = jsonRows<{ points: number; count: number }>(
    row.distribution,
  );

  return {
    summary: {
      leagues: row.leagueCount,
      rounds: row.roundCount,
      players: row.playerCount,
      songs: row.songCount,
      points: row.pointCount,
    },
    leaderboard,
    topSongs: topSongs.map(mapSong),
    pointDistribution: createPointDistribution(distribution),
    alignment: [],
  };
}

export async function getDashboardAlignmentData(
  filter: AnalyticsFilter,
): Promise<DashboardData["alignment"]> {
  const scopeKey = analyticsScopeKey(filter.leagueIds);
  if (
    canUseSongDerivedMats(filter) &&
    (await hasCompletedScopeMaterialization(scopeKey))
  ) {
    return getMaterializedDashboardAlignmentData(scopeKey);
  }

  if (isMultiLeagueScope(filter)) {
    // Avoid 75s live alignment; caller should trigger combo materialization.
    return [];
  }

  const alignments = await db.execute<{
    leftId: string;
    leftName: string;
    rightId: string;
    rightName: string;
    alignment: number;
    comparableFeatures: number;
    sharedRounds: number;
    scopeRounds: number;
  }>(sql`
    with ${alignmentComparisonCtes(filter)}
    select
      pc.left_id as "leftId",
      ${competitorDisplayName("left_player")} as "leftName",
      pc.right_id as "rightId",
      ${competitorDisplayName("right_player")} as "rightName",
      pc.dot / nullif(pc.magnitude, 0) as alignment,
      pc.comparable_features as "comparableFeatures",
      pc.shared_rounds as "sharedRounds",
      (select scope_rounds from scope_thresholds) as "scopeRounds"
    from pair_comparisons pc
    join competitors left_player on left_player.id = pc.left_id
    join competitors right_player on right_player.id = pc.right_id
    where pc.magnitude > 0
    order by alignment desc
    limit 3
  `);
  return alignments;
}

function songSearchPredicate(search: string): SQL {
  if (!search) return sql`true`;
  const term = `%${search}%`;
  return sql`(
    ranked_songs.title ilike ${term}
    or ranked_songs.artist ilike ${term}
    or coalesce(ranked_songs.album, '') ilike ${term}
    or ranked_songs."submitterName" ilike ${term}
  )`;
}

function sortKeyword(direction: SortDirection): SQL {
  return direction === "asc" ? sql`asc` : sql`desc`;
}

function nullsKeyword(): SQL {
  return sql`nulls last`;
}

function songOrder(sort: SongSort, direction: SortDirection): SQL {
  const dir = sortKeyword(direction);
  const nulls = nullsKeyword();
  if (sort === "title") return sql`title ${dir}, artist asc`;
  if (sort === "submitter") return sql`"submitterName" ${dir}, title asc`;
  if (sort === "scope") return sql`"leagueName" ${dir}, "roundOrdinal" ${dir}, title asc`;
  if (sort === "points-per-voter")
    return sql`"pointsPerEligibleVoter" ${dir} ${nulls}, points desc`;
  if (sort === "positive-reach")
    return sql`"positiveReach" ${dir} ${nulls}, points desc`;
  if (sort === "round-share")
    return sql`"roundPointShare" ${dir} ${nulls}, points desc`;
  if (sort === "support-eb")
    return sql`"supportIndexEb" ${dir} ${nulls}, "supportIndex" desc nulls last, points desc`;
  if (sort === "support-z")
    return sql`"supportZ" ${dir} ${nulls}, "supportIndexEb" desc nulls last, points desc`;
  if (sort === "normalized-index")
    return sql`"supportIndex" ${dir} ${nulls}, points desc`;
  if (sort === "percentile")
    return sql`"performancePercentile" ${dir} ${nulls}, points desc`;
  if (sort === "newest") return sql`"submittedAt" ${dir}, title asc`;
  return sql`points ${dir}, "supportIndexEb" desc nulls last, "supportIndex" desc nulls last`;
}

export async function getSongsData(
  filter: AnalyticsFilter,
  {
    page,
    pageSize = 25,
    search,
    sort,
    direction,
  }: {
    page: number;
    pageSize?: number;
    search: string;
    sort: SongSort;
    direction: SortDirection;
  },
): Promise<SongsData> {
  const useMat =
    canUseSongDerivedMats(filter) &&
    (await hasCompletedAllLeaguesMaterialization());
  const ctes = useMat
    ? sql`ranked_songs as (${matSongSelect(filter.leagueIds)})`
    : sql`${songStatsCtes(filter)}, ranked_songs as (${songSelect()})`;
  const predicate = songSearchPredicate(search);
  const [packedRow] = await db.execute<SongsPackedQueryRow>(sql`
    with ${ctes},
    filtered_songs as (
      select * from ranked_songs
      where ${predicate}
    ),
    paged_songs as (
      select *
      from filtered_songs
      order by ${songOrder(sort, direction)}
      limit ${pageSize} offset ${(page - 1) * pageSize}
    )
    select
      (select count(*)::int from filtered_songs) as "totalCount",
      (
        select coalesce(json_agg(to_jsonb(paged_songs) order by ${songOrder(sort, direction)}), '[]'::json)
        from paged_songs
      ) as rows
  `);
  const rows = jsonRows<SongQueryRow>(packedRow?.rows);

  return {
    rows: rows.map(mapSong),
    total: packedRow?.totalCount ?? 0,
    page,
    pageSize,
    search,
    sort,
    direction,
  };
}

export function playerAggregateCtes(): SQL {
  return sql`
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        count(*)::int as submissions,
        sum(eligible_rows)::int as eligible_rows,
        sum(expected_points)::double precision as expected_points,
        max(round_points)::double precision as round_points
      from song_stats
      group by submitter_id, round_id
    ),
    player_round_indexed as (
      select
        pr.*,
        case when pr.expected_points > 0
          then pr.points::double precision / pr.expected_points else null end as round_index,
        case
          when count(*) over (partition by pr.round_id) = 1 then 100::double precision
          else percent_rank() over (
            partition by pr.round_id
            order by case
              when pr.expected_points > 0
                then pr.points::double precision / pr.expected_points
              else null
            end asc nulls first
          ) * 100
        end as round_percentile,
        rank() over (partition by pr.round_id order by pr.points desc) as round_rank
      from player_round pr
    ),
    player_aggregates as (
      select
        pri.submitter_id,
        sum(pri.points)::int as total_points,
        sum(pri.submissions)::int as submissions,
        count(*)::int as entered_rounds,
        sum(pri.eligible_rows)::int as eligible_rows,
        avg(pri.round_index) as average_round_index,
        avg(pri.round_percentile) as average_round_percentile,
        count(*) filter (where pri.round_rank = 1)::int as round_wins,
        count(*) filter (where pri.round_percentile >= 75)::int as top_quartile_rounds
      from player_round_indexed pri
      group by pri.submitter_id
    )
  `;
}

export function playerStatsCtes(filter: AnalyticsFilter): SQL {
  return sql`${songStatsCtes(filter)}, ${playerAggregateCtes()}`;
}

type PlayerQueryRow = {
  id: string;
  name: string;
  totalPoints: number;
  submissions: number;
  enteredRounds: number;
  pointsPerSubmission: number | null;
  pointsPerEligibleVoter: number | null;
  averageRoundIndex: number | null;
  averageRoundPercentile: number | null;
  roundWins: number;
  topQuartileRate: number | null;
  performanceRank: number | null;
};

type PlayerProfilePackedQueryRow = {
  overview: unknown;
  submissions: unknown;
  distributions: unknown;
  relationships: unknown;
  mutualRelationships: unknown;
  alignments: unknown;
  timing: unknown;
};

async function getMaterializedPlayerProfileData(
  player: { id: string; name: string },
  minimumRounds: number,
  scopeKey: string,
  leagueIds: readonly string[],
): Promise<PlayerProfileData> {
  const [packedRow] = await db.execute<PlayerProfilePackedQueryRow>(sql`
    with all_song_rows as (
      ${matSongSelect(leagueIds)}
    ),
    submission_rows as (
      select *
      from all_song_rows
      where "submitterId" = ${player.id}
    ),
    overview_rows as (
      select
        id,
        name,
        total_points as "totalPoints",
        submissions,
        entered_rounds as "enteredRounds",
        points_per_submission as "pointsPerSubmission",
        points_per_eligible_voter as "pointsPerEligibleVoter",
        average_round_index as "averageRoundIndex",
        average_round_percentile as "averageRoundPercentile",
        round_wins as "roundWins",
        top_quartile_rate as "topQuartileRate",
        performance_rank as "performanceRank"
      from analytics_player_stats
      where scope_key = ${scopeKey} and id = ${player.id}
      limit 1
    ),
    distribution_rows as (
      select direction, points, count
      from analytics_player_point_distribution
      where scope_key = ${scopeKey} and player_id = ${player.id}
    ),
    directional_relationships as (
      select
        direction,
        right_id as "competitorId",
        right_name as "competitorName",
        points,
        opportunities as encounters,
        shared_rounds as "sharedRounds",
        scope_rounds as "scopeRounds",
        points_per_opportunity as "pointsPerEncounter",
        positive_rate as "positiveRate"
      from analytics_relationship_pairs
      where scope_key = ${scopeKey} and left_id = ${player.id}
    ),
    mutual_relationships as (
      select
        case when left_id = ${player.id} then right_id else left_id end as "competitorId",
        case when left_id = ${player.id} then right_name else left_name end as "competitorName",
        points,
        opportunities,
        shared_rounds as "sharedRounds",
        scope_rounds as "scopeRounds",
        points_per_opportunity as "pointsPerOpportunity",
        positive_rate as "positiveRate",
        ballot_point_share as "ballotPointShare"
      from analytics_relationship_mutual
      where scope_key = ${scopeKey}
        and (left_id = ${player.id} or right_id = ${player.id})
    ),
    alignment_rows as (
      select
        case when left_id = ${player.id} then right_id else left_id end as "competitorId",
        case when left_id = ${player.id} then right_name else left_name end as "competitorName",
        alignment,
        comparable_features as "comparableFeatures",
        shared_rounds as "sharedRounds",
        scope_rounds as "scopeRounds"
      from analytics_relationship_alignment
      where scope_key = ${scopeKey}
        and (left_id = ${player.id} or right_id = ${player.id})
    ),
    timing_rows as (
      select
        t.round_id as "roundId",
        t.round_name as "roundName",
        t.league_name as "leagueName",
        t.league_slug as "leagueSlug",
        t.league_music_league_id as "leagueMusicLeagueId",
        t.source_round_id as "sourceRoundId",
        t.ordinal,
        t.cast_at as "castAt",
        t.relative_order as "relativeOrder",
        t.ballot_rank as "ballotRank",
        t.tie_count as "tieCount",
        t.observed_voters as "observedVoters",
        t.participation,
        r.source_created_at as "sourceCreatedAt"
      from analytics_player_timing t
      join rounds r on r.id = t.round_id
      where t.player_id = ${player.id}
        and ${
          leagueIds.length === 0
            ? sql`true`
            : sql`t.league_id in (${sql.join(
                leagueIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
        }
    )
    select
      (select coalesce(json_agg(to_jsonb(overview_rows)), '[]'::json) from overview_rows) as overview,
      (select coalesce(json_agg(to_jsonb(submission_rows) order by "supportIndex" desc nulls last, points desc), '[]'::json) from submission_rows) as submissions,
      (select coalesce(json_agg(to_jsonb(distribution_rows) order by direction, points), '[]'::json) from distribution_rows) as distributions,
      (select coalesce(json_agg(to_jsonb(directional_relationships) order by direction, "pointsPerEncounter" desc, encounters desc), '[]'::json) from directional_relationships) as relationships,
      (select coalesce(json_agg(to_jsonb(mutual_relationships) order by "pointsPerOpportunity" desc, opportunities desc), '[]'::json) from mutual_relationships) as "mutualRelationships",
      (select coalesce(json_agg(to_jsonb(alignment_rows) order by alignment desc, "comparableFeatures" desc), '[]'::json) from alignment_rows) as alignments,
      (select coalesce(json_agg(to_jsonb(timing_rows) order by "sourceCreatedAt" desc, "castAt" desc nulls last), '[]'::json) from timing_rows) as timing
  `);

  const overviewRows = jsonRows<PlayerQueryRow>(packedRow?.overview);
  const distributionRows = jsonRows<{
    direction: "received" | "given";
    points: number;
    count: number;
  }>(packedRow?.distributions);
  const timingRows = jsonRows<TimingRow>(packedRow?.timing);

  return {
    alignments: jsonRows<PlayerProfileData["alignments"][number]>(
      packedRow?.alignments,
    ),
    givenDistribution: createPointDistribution(
      distributionRows.filter(({ direction }) => direction === "given"),
    ),
    mutualRelationships: jsonRows<MutualRelationship>(
      packedRow?.mutualRelationships,
    ),
    overview: overviewRows[0]
      ? {
          ...overviewRows[0],
          provisional: overviewRows[0].enteredRounds < minimumRounds,
        }
      : null,
    player,
    receivedDistribution: createPointDistribution(
      distributionRows.filter(({ direction }) => direction === "received"),
    ),
    relationships: jsonRows<DirectionalRelationship>(packedRow?.relationships),
    submissions: jsonRows<SongQueryRow>(packedRow?.submissions).map(mapSong),
    timing: timingRows.map((row) => ({
      ...row,
      castAt: row.castAt ? isoTimestamp(row.castAt) : null,
    })),
  };
}

function playerSearchPredicate(search: string): SQL {
  return search ? sql`${competitorDisplayName("c")} ilike ${`%${search}%`}` : sql`true`;
}

function playerOrder(
  sort: PlayerSort,
  minimumRounds: number,
  direction: SortDirection,
): SQL {
  const provisional = sql`case when pa.entered_rounds >= ${minimumRounds} then 0 else 1 end`;
  const dir = sortKeyword(direction);
  const nulls = nullsKeyword();
  if (sort === "points")
    return sql`${provisional}, pa.total_points ${dir}, name asc`;
  if (sort === "songs")
    return sql`${provisional}, pa.submissions ${dir}, pa.total_points desc`;
  if (sort === "rounds")
    return sql`${provisional}, pa.entered_rounds ${dir}, pa.total_points desc`;
  if (sort === "name") return sql`name ${dir}`;
  if (sort === "points-per-song")
    return sql`${provisional}, "pointsPerSubmission" ${dir} ${nulls}, pa.total_points desc`;
  if (sort === "points-per-voter")
    return sql`${provisional}, "pointsPerEligibleVoter" ${dir} ${nulls}, pa.total_points desc`;
  if (sort === "percentile")
    return sql`${provisional}, pa.average_round_percentile ${dir} ${nulls}, pa.total_points desc`;
  if (sort === "wins")
    return sql`${provisional}, pa.round_wins ${dir}, pa.total_points desc`;
  if (sort === "top-quartile")
    return sql`${provisional}, "topQuartileRate" ${dir} ${nulls}, pa.total_points desc`;
  return sql`${provisional}, pa.average_round_index ${dir} ${nulls}, pa.entered_rounds desc`;
}

function matPlayerSearchPredicate(search: string): SQL {
  return search ? sql`name ilike ${`%${search}%`}` : sql`true`;
}

function matPlayerOrder(
  sort: PlayerSort,
  minimumRounds: number,
  direction: SortDirection,
): SQL {
  const provisional = sql`case when "enteredRounds" >= ${minimumRounds} then 0 else 1 end`;
  const dir = sortKeyword(direction);
  const nulls = nullsKeyword();
  if (sort === "points") return sql`${provisional}, "totalPoints" ${dir}, name asc`;
  if (sort === "songs")
    return sql`${provisional}, submissions ${dir}, "totalPoints" desc`;
  if (sort === "rounds")
    return sql`${provisional}, "enteredRounds" ${dir}, "totalPoints" desc`;
  if (sort === "name") return sql`name ${dir}`;
  if (sort === "points-per-song")
    return sql`${provisional}, "pointsPerSubmission" ${dir} ${nulls}, "totalPoints" desc`;
  if (sort === "points-per-voter")
    return sql`${provisional}, "pointsPerEligibleVoter" ${dir} ${nulls}, "totalPoints" desc`;
  if (sort === "percentile")
    return sql`${provisional}, "averageRoundPercentile" ${dir} ${nulls}, "totalPoints" desc`;
  if (sort === "wins")
    return sql`${provisional}, "roundWins" ${dir}, "totalPoints" desc`;
  if (sort === "top-quartile")
    return sql`${provisional}, "topQuartileRate" ${dir} ${nulls}, "totalPoints" desc`;
  return sql`${provisional}, "averageRoundIndex" ${dir} ${nulls}, "enteredRounds" desc`;
}

export async function getPlayersData(
  filter: AnalyticsFilter,
  {
    search,
    sort,
    direction,
  }: {
    search: string;
    sort: PlayerSort;
    direction: SortDirection;
  },
): Promise<PlayersData> {
  const scopeRounds = await countScopeRounds(filter);
  const minimumRounds = qualificationRoundFloor(scopeRounds);

  if (
    canUseSongDerivedMats(filter) &&
    (await hasCompletedAllLeaguesMaterialization()) &&
    (isAllLeaguesScope(filter) || isSingleLeagueScope(filter))
  ) {
    const scopeKey = analyticsScopeKey(filter.leagueIds);
    const rows = await db.execute<PlayerQueryRow>(sql`
      with ranked_players as (
        select
          id,
          name,
          total_points as "totalPoints",
          submissions,
          entered_rounds as "enteredRounds",
          points_per_submission as "pointsPerSubmission",
          points_per_eligible_voter as "pointsPerEligibleVoter",
          average_round_index as "averageRoundIndex",
          average_round_percentile as "averageRoundPercentile",
          round_wins as "roundWins",
          top_quartile_rate as "topQuartileRate",
          case
            when entered_rounds >= ${minimumRounds}
              then rank() over (
                order by
                  case when entered_rounds >= ${minimumRounds} then 0 else 1 end,
                  average_round_index desc nulls last,
                  entered_rounds desc,
                  total_points desc,
                  id
              )::int
            else null
          end as "performanceRank"
        from analytics_player_stats
        where scope_key = ${scopeKey}
      )
      select *
      from ranked_players
      where ${matPlayerSearchPredicate(search)}
      order by ${matPlayerOrder(sort, minimumRounds, direction)}
    `);

    return {
      direction,
      minimumRounds,
      rows: rows.map((row) => ({
        ...row,
        provisional: row.enteredRounds < minimumRounds,
      })),
      search,
      sort,
    };
  }

  if (
    isMultiLeagueScope(filter) &&
    (await hasCompletedAllLeaguesMaterialization())
  ) {
    const rows = await db.execute<PlayerQueryRow>(sql`
      with ranked_songs as (${matSongSelect(filter.leagueIds)}),
      player_round as (
        select
          "submitterId" as submitter_id,
          min("submitterName") as name,
          "roundId" as round_id,
          sum(points)::int as points,
          count(*)::int as submissions,
          sum("eligibleRows")::int as eligible_rows,
          sum("expectedPoints")::double precision as expected_points
        from ranked_songs
        group by "submitterId", "roundId"
      ),
      player_round_indexed as (
        select
          pr.*,
          case when pr.expected_points > 0
            then pr.points::double precision / pr.expected_points else null end as round_index,
          case
            when count(*) over (partition by pr.round_id) = 1 then 100::double precision
            else percent_rank() over (
              partition by pr.round_id
              order by case
                when pr.expected_points > 0
                  then pr.points::double precision / pr.expected_points
                else null
              end asc nulls first
            ) * 100
          end as round_percentile,
          rank() over (partition by pr.round_id order by pr.points desc) as round_rank
        from player_round pr
      ),
      player_aggregates as (
        select
          pri.submitter_id,
          min(pri.name) as name,
          sum(pri.points)::int as total_points,
          sum(pri.submissions)::int as submissions,
          count(*)::int as entered_rounds,
          sum(pri.eligible_rows)::int as eligible_rows,
          avg(pri.round_index) as average_round_index,
          avg(pri.round_percentile) as average_round_percentile,
          count(*) filter (where pri.round_rank = 1)::int as round_wins,
          count(*) filter (where pri.round_percentile >= 75)::int as top_quartile_rounds
        from player_round_indexed pri
        group by pri.submitter_id
      ),
      ranked_players as (
        select
          pa.submitter_id as id,
          pa.name,
          pa.total_points as "totalPoints",
          pa.submissions,
          pa.entered_rounds as "enteredRounds",
          case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
          case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
          pa.average_round_index as "averageRoundIndex",
          pa.average_round_percentile as "averageRoundPercentile",
          pa.round_wins as "roundWins",
          case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate",
          case
            when pa.entered_rounds >= ${minimumRounds}
              then rank() over (
                order by
                  case when pa.entered_rounds >= ${minimumRounds} then 0 else 1 end,
                  pa.average_round_index desc nulls last,
                  pa.entered_rounds desc,
                  pa.total_points desc,
                  pa.submitter_id
              )::int
            else null
          end as "performanceRank"
        from player_aggregates pa
      )
      select *
      from ranked_players
      where ${matPlayerSearchPredicate(search)}
      order by ${matPlayerOrder(sort, minimumRounds, direction)}
    `);
    return {
      direction,
      minimumRounds,
      rows: rows.map((row) => ({
        ...row,
        provisional: row.enteredRounds < minimumRounds,
      })),
      search,
      sort,
    };
  }

  const rows = await db.execute<PlayerQueryRow>(sql`
    with ${playerStatsCtes(filter)},
    ranked_players as (
      select
        c.id,
        ${competitorDisplayName("c")} as name,
        pa.total_points as "totalPoints",
        pa.submissions,
        pa.entered_rounds as "enteredRounds",
        case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
        case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
        pa.average_round_index as "averageRoundIndex",
        pa.average_round_percentile as "averageRoundPercentile",
        pa.round_wins as "roundWins",
        case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate",
        case
          when pa.entered_rounds >= ${minimumRounds}
            then rank() over (
              order by
                case when pa.entered_rounds >= ${minimumRounds} then 0 else 1 end,
                pa.average_round_index desc nulls last,
                pa.entered_rounds desc,
                pa.total_points desc,
                c.id
            )::int
          else null
        end as "performanceRank"
      from player_aggregates pa
      join competitors c on c.id = pa.submitter_id
    )
    select *
    from ranked_players
    where ${search ? sql`name ilike ${`%${search}%`}` : sql`true`}
    order by ${matPlayerOrder(sort, minimumRounds, direction)}
  `);

  return {
    rows: rows.map((row) => ({
      ...row,
      provisional: row.enteredRounds < minimumRounds,
    })),
    sort,
    direction,
    search,
    minimumRounds,
  };
}

export async function getPlayerProfileData(
  playerId: string,
  filter: AnalyticsFilter,
): Promise<PlayerProfileData | null> {
  if (!isUuid(playerId)) return null;
  const playerRows = await db
    .select({
      id: competitors.id,
      name: sql<string>`coalesce(${competitors.nameOverride}, ${competitors.name})`,
    })
    .from(competitors)
    .where(eq(competitors.id, playerId))
    .limit(1);
  const player = playerRows[0];
  if (!player) return null;

  const minimumRounds = qualificationRoundFloor(await countScopeRounds(filter));

  if (
    canUseSongDerivedMats(filter) &&
    (await hasCompletedScopeMaterialization(analyticsScopeKey(filter.leagueIds))) &&
    (isAllLeaguesScope(filter) || isSingleLeagueScope(filter))
  ) {
    return getMaterializedPlayerProfileData(
      player,
      minimumRounds,
      analyticsScopeKey(filter.leagueIds),
      filter.leagueIds,
    );
  }

  const [packedRow] = await db.execute<PlayerProfilePackedQueryRow>(sql`
    with ${songStatsCtes(filter)},
    ${playerAggregateCtes()},
    ${alignmentComparisonTailCtes(playerId)},
    ranked_songs as (${songSelect()}),
    overview_rows as (
      select
        c.id,
        ${competitorDisplayName("c")} as name,
        pa.total_points as "totalPoints",
        pa.submissions,
        pa.entered_rounds as "enteredRounds",
        case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
        case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
        pa.average_round_index as "averageRoundIndex",
        pa.average_round_percentile as "averageRoundPercentile",
        pa.round_wins as "roundWins",
        case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate",
        null::int as "performanceRank"
      from player_aggregates pa
      join competitors c on c.id = pa.submitter_id
      where c.id = ${playerId}
      limit 1
    ),
    submission_rows as (
      select * from ranked_songs
      where "submitterId" = ${playerId}
    ),
    distribution_rows as (
      select 'received' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.submitter_id = ${playerId}
      group by ev.points
      union all
      select 'given' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.voter_id = ${playerId}
      group by ev.points
    ),
    relationship_rows as (
      select
        'received'::text as direction,
        ev.voter_id as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as encounters,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.submitter_id = ${playerId}
      group by ev.voter_id
      union all
      select
        'given'::text as direction,
        ev.submitter_id as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as encounters,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.voter_id = ${playerId}
      group by ev.submitter_id
    ),
    directional_relationships as (
      select
        rr.direction,
        rr.competitor_id as "competitorId",
        ${competitorDisplayName("c")} as "competitorName",
        rr.points,
        rr.encounters,
        rr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        rr.points::double precision / rr.encounters as "pointsPerEncounter",
        rr.positives::double precision / rr.encounters as "positiveRate"
      from relationship_rows rr
      join competitors c on c.id = rr.competitor_id
      where rr.shared_rounds >= (
        select minimum_shared_rounds from scope_thresholds
      )
    ),
    mutual_rows as (
      select
        case
          when ev.voter_id = ${playerId} then ev.submitter_id
          else ev.voter_id
        end as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.voter_id = ${playerId}
         or ev.submitter_id = ${playerId}
      group by competitor_id
    ),
    mutual_budget_rounds as (
      select distinct
        case
          when ev.voter_id = ${playerId} then ev.submitter_id
          else ev.voter_id
        end as competitor_id,
        ev.round_id,
        ev.voter_id,
        bt.ballot_points
      from effective_votes ev
      join ballot_totals bt
        on bt.round_id = ev.round_id
       and bt.voter_id = ev.voter_id
      where ev.voter_id = ${playerId}
         or ev.submitter_id = ${playerId}
    ),
    mutual_budgets as (
      select
        competitor_id,
        sum(ballot_points)::double precision as eligible_ballot_points
      from mutual_budget_rounds
      group by competitor_id
    ),
    mutual_relationships as (
      select
        mr.competitor_id as "competitorId",
        ${competitorDisplayName("c")} as "competitorName",
        mr.points,
        mr.opportunities,
        mr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        mr.points::double precision / mr.opportunities as "pointsPerOpportunity",
        mr.positives::double precision / mr.opportunities as "positiveRate",
        mr.points::double precision / nullif(mb.eligible_ballot_points, 0) as "ballotPointShare"
      from mutual_rows mr
      join mutual_budgets mb on mb.competitor_id = mr.competitor_id
      join competitors c on c.id = mr.competitor_id
      where mr.opportunities > 0
        and mb.eligible_ballot_points > 0
        and mr.shared_rounds >= (
          select minimum_shared_rounds from scope_thresholds
        )
    ),
    alignment_rows as (
      select
        case
          when pc.left_id = ${playerId} then pc.right_id
          else pc.left_id
        end as "competitorId",
        ${competitorDisplayName("c")} as "competitorName",
        pc.dot / nullif(pc.magnitude, 0) as alignment,
        pc.comparable_features as "comparableFeatures",
        pc.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds"
      from pair_comparisons pc
      join competitors c
        on c.id = case
          when pc.left_id = ${playerId} then pc.right_id
          else pc.left_id
        end
      where (pc.left_id = ${playerId} or pc.right_id = ${playerId})
        and pc.magnitude > 0
    ),
    round_ballot_counts as (
      select round_id, count(*)::int as observed_voters
      from active_ballots
      group by round_id
    ),
    ballot_positions as (
      select
        active_ballots.*,
        rbc.observed_voters,
        rank() over (
          partition by active_ballots.round_id
          order by active_ballots.cast_at
        )::int as ballot_rank,
        count(*) over (
          partition by active_ballots.round_id, active_ballots.cast_at
        )::int as tie_count
      from active_ballots
      join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
    ),
    ranked_ballots as (
      select
        ballot_positions.*,
        case
          when observed_voters = 1 then 0.5::double precision
          else (
            ballot_rank::double precision - 1 + tie_count::double precision / 2
          ) / observed_voters
        end as relative_order
      from ballot_positions
    ),
    player_submission_rounds as (
      select distinct s.round_id
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      where s.submitter_id = ${playerId}
    ),
    player_participation as (
      select
        sr.id as round_id,
        rb.cast_at,
        rb.relative_order,
        rb.ballot_rank,
        rb.tie_count,
        coalesce(rb.observed_voters, rbc.observed_voters, 0)::int as observed_voters,
        case when rb.voter_id is null then 'did_not_vote' else 'voted' end as participation
      from selected_rounds sr
      left join ranked_ballots rb
        on rb.round_id = sr.id
       and rb.voter_id = ${playerId}
      left join round_ballot_counts rbc on rbc.round_id = sr.id
      where rb.voter_id is not null
         or exists (
          select 1
          from player_submission_rounds psr
          where psr.round_id = sr.id
        )
    ),
    timing_rows as (
      select
        pp.round_id as "roundId",
        sr.name as "roundName",
        l.name as "leagueName",
        l.slug as "leagueSlug",
        l.music_league_id as "leagueMusicLeagueId",
        sr.source_round_id as "sourceRoundId",
        sr.ordinal,
        sr.source_created_at as "sourceCreatedAt",
        pp.cast_at as "castAt",
        pp.relative_order as "relativeOrder",
        pp.ballot_rank as "ballotRank",
        pp.tie_count as "tieCount",
        pp.observed_voters as "observedVoters",
        pp.participation as "participation"
      from player_participation pp
      join selected_rounds sr on sr.id = pp.round_id
      join leagues l on l.id = sr.league_id
    )
    select
      (select coalesce(json_agg(to_jsonb(overview_rows)), '[]'::json) from overview_rows) as overview,
      (
        select coalesce(json_agg(to_jsonb(submission_rows) order by "supportIndex" desc nulls last, points desc), '[]'::json)
        from submission_rows
      ) as submissions,
      (
        select coalesce(json_agg(to_jsonb(distribution_rows) order by direction, points), '[]'::json)
        from distribution_rows
      ) as distributions,
      (
        select coalesce(json_agg(to_jsonb(directional_relationships) order by direction, "pointsPerEncounter" desc, encounters desc), '[]'::json)
        from directional_relationships
      ) as relationships,
      (
        select coalesce(json_agg(to_jsonb(mutual_relationships) order by "pointsPerOpportunity" desc, opportunities desc), '[]'::json)
        from mutual_relationships
      ) as "mutualRelationships",
      (
        select coalesce(json_agg(to_jsonb(alignment_rows) order by alignment desc, "comparableFeatures" desc), '[]'::json)
        from alignment_rows
      ) as alignments,
      (
        select coalesce(json_agg(to_jsonb(timing_rows) order by "sourceCreatedAt" desc, "castAt" desc nulls last), '[]'::json)
        from timing_rows
      ) as timing
  `);

  const overviewRows = jsonRows<PlayerQueryRow>(packedRow?.overview);
  const submissionRows = jsonRows<SongQueryRow>(packedRow?.submissions);
  const distributionRows = jsonRows<{
    direction: "received" | "given";
    points: number;
    count: number;
  }>(packedRow?.distributions);
  const relationships = jsonRows<DirectionalRelationship>(packedRow?.relationships);
  const mutualRelationships = jsonRows<MutualRelationship>(
    packedRow?.mutualRelationships,
  );
  const alignments = jsonRows<PlayerProfileData["alignments"][number]>(
    packedRow?.alignments,
  );
  const timingRows = jsonRows<TimingRow & { sourceCreatedAt?: string }>(
    packedRow?.timing,
  );

  return {
    player,
    overview: overviewRows[0]
      ? {
          ...overviewRows[0],
          provisional: overviewRows[0].enteredRounds < minimumRounds,
        }
      : null,
    submissions: submissionRows.map(mapSong),
    receivedDistribution: createPointDistribution(
      distributionRows.filter(({ direction }) => direction === "received"),
    ),
    givenDistribution: createPointDistribution(
      distributionRows.filter(({ direction }) => direction === "given"),
    ),
    relationships,
    mutualRelationships,
    alignments,
    timing: timingRows.map((row) => ({
      ...row,
      castAt: row.castAt ? isoTimestamp(row.castAt) : null,
    })),
  };
}

function sortRelationshipRows(
  rows: RelationshipTableRow[],
  sort: RelationshipSort,
  direction: SortDirection,
): RelationshipTableRow[] {
  function value(row: RelationshipTableRow): number | string | null {
    if (sort === "player") return row.rightName ?? row.leftName;
    if (sort === "points") return row.points;
    if (sort === "rate") return row.pointsPerOpportunity;
    if (sort === "opportunities") return row.opportunities;
    if (sort === "positive") return row.positiveRate;
    if (sort === "rounds") return row.sharedRounds ?? row.votedRounds;
    if (sort === "share") return row.ballotPointShare;
    if (sort === "alignment") return row.alignment;
    if (sort === "features") return row.comparableFeatures;
    if (sort === "timing") return row.averageTiming;
    if (sort === "missed") return row.missedBallots;
    return null;
  }
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      return (
        String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * multiplier
      );
    }
    if (leftValue === null && rightValue === null) {
      return `${left.leftName}${left.rightName ?? ""}`.localeCompare(
        `${right.leftName}${right.rightName ?? ""}`,
      );
    }
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
    return `${left.leftName}${left.rightName ?? ""}`.localeCompare(
      `${right.leftName}${right.rightName ?? ""}`,
    );
  });
}

async function focusPlayer(playerId: string | null) {
  if (!playerId) return null;
  const rows = await db
    .select({
      id: competitors.id,
      name: sql<string>`coalesce(${competitors.nameOverride}, ${competitors.name})`,
    })
    .from(competitors)
    .where(eq(competitors.id, playerId))
    .limit(1);
  return rows[0] ?? null;
}

async function getMaterializedRelationshipRows(
  tab: RelationshipTab,
  focus: string | null,
  scopeKey: string,
  leagueIds: readonly string[],
): Promise<RelationshipTableRow[]> {
  if (tab === "alignment") {
    return db.execute<RelationshipTableRow>(sql`
      select
        left_id as "leftId",
        left_name as "leftName",
        right_id as "rightId",
        right_name as "rightName",
        null::int as points,
        null::int as opportunities,
        shared_rounds as "sharedRounds",
        scope_rounds as "scopeRounds",
        null::double precision as "pointsPerOpportunity",
        null::double precision as "positiveRate",
        null::double precision as "ballotPointShare",
        alignment,
        comparable_features as "comparableFeatures",
        null::double precision as "averageTiming",
        null::int as "votedRounds",
        null::int as "missedBallots"
      from analytics_relationship_alignment
      where scope_key = ${scopeKey}
        and (${focus}::uuid is null or left_id = ${focus} or right_id = ${focus})
    `);
  }

  if (tab === "mutual") {
    return db.execute<RelationshipTableRow>(sql`
      select
        left_id as "leftId",
        left_name as "leftName",
        right_id as "rightId",
        right_name as "rightName",
        points,
        opportunities,
        shared_rounds as "sharedRounds",
        scope_rounds as "scopeRounds",
        points_per_opportunity as "pointsPerOpportunity",
        positive_rate as "positiveRate",
        ballot_point_share as "ballotPointShare",
        null::double precision as alignment,
        null::int as "comparableFeatures",
        null::double precision as "averageTiming",
        null::int as "votedRounds",
        null::int as "missedBallots"
      from analytics_relationship_mutual
      where scope_key = ${scopeKey}
        and (${focus}::uuid is null or left_id = ${focus} or right_id = ${focus})
    `);
  }

  if (tab === "timing") {
    return db.execute<RelationshipTableRow>(sql`
      select
        player_id as "leftId",
        player_name as "leftName",
        null::uuid as "rightId",
        null::text as "rightName",
        null::int as points,
        null::int as opportunities,
        count(*)::int as "sharedRounds",
        (select count(*)::int from rounds ${
          leagueIds.length
            ? sql`where league_id in (${sql.join(
                leagueIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql``
        }) as "scopeRounds",
        null::double precision as "pointsPerOpportunity",
        null::double precision as "positiveRate",
        null::double precision as "ballotPointShare",
        null::double precision as alignment,
        null::int as "comparableFeatures",
        avg(relative_order) as "averageTiming",
        count(*) filter (where participation = 'voted')::int as "votedRounds",
        count(*) filter (where participation = 'did_not_vote')::int as "missedBallots"
      from analytics_player_timing
      where (${focus}::uuid is null or player_id = ${focus})
        and ${
          leagueIds.length === 0
            ? sql`true`
            : sql`league_id in (${sql.join(
                leagueIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
        }
      group by player_id, player_name
    `);
  }

  return db.execute<RelationshipTableRow>(sql`
    select
      left_id as "leftId",
      left_name as "leftName",
      right_id as "rightId",
      right_name as "rightName",
      points,
      opportunities,
      shared_rounds as "sharedRounds",
      scope_rounds as "scopeRounds",
      points_per_opportunity as "pointsPerOpportunity",
      positive_rate as "positiveRate",
      null::double precision as "ballotPointShare",
      null::double precision as alignment,
      null::int as "comparableFeatures",
      null::double precision as "averageTiming",
      null::int as "votedRounds",
      null::int as "missedBallots"
    from analytics_relationship_pairs
    where scope_key = ${scopeKey}
      and direction = ${tab}
      and (${focus}::uuid is null or left_id = ${focus})
  `);
}

export async function getRelationshipsTableData(
  filter: AnalyticsFilter,
  {
    direction,
    focusPlayerId,
    sort,
    tab,
  }: {
    direction: SortDirection;
    focusPlayerId: string | null;
    sort: RelationshipSort;
    tab: RelationshipTab;
  },
): Promise<RelationshipsTableData> {
  const focus = isUuid(focusPlayerId) ? focusPlayerId : null;
  const focusRowPromise = focusPlayer(focus);
  const scopeKey = analyticsScopeKey(filter.leagueIds);
  if (
    canUseSongDerivedMats(filter) &&
    (await hasCompletedScopeMaterialization(scopeKey))
  ) {
    const [focusPlayerRow, rows] = await Promise.all([
      focusRowPromise,
      getMaterializedRelationshipRows(tab, focus, scopeKey, filter.leagueIds),
    ]);

    return {
      direction,
      focusPlayer: focusPlayerRow,
      rows: sortRelationshipRows(rows, sort, direction),
      sort,
      tab,
    };
  }

  if (isMultiLeagueScope(filter) && tab !== "timing") {
    return {
      direction,
      focusPlayer: await focusRowPromise,
      needsScopeMaterialization: true,
      rows: [],
      scopeKey,
      sort,
      tab,
    };
  }

  const rowsPromise =
    tab === "alignment"
      ? db.execute<RelationshipTableRow>(sql`
          with ${alignmentComparisonCtes(filter, focus ?? undefined)}
          select
            pc.left_id as "leftId",
            ${competitorDisplayName("left_player")} as "leftName",
            pc.right_id as "rightId",
            ${competitorDisplayName("right_player")} as "rightName",
            null::int as points,
            null::int as opportunities,
            pc.shared_rounds as "sharedRounds",
            (select scope_rounds from scope_thresholds) as "scopeRounds",
            null::double precision as "pointsPerOpportunity",
            null::double precision as "positiveRate",
            null::double precision as "ballotPointShare",
            pc.dot / nullif(pc.magnitude, 0) as alignment,
            pc.comparable_features as "comparableFeatures",
            null::double precision as "averageTiming",
            null::int as "votedRounds",
            null::int as "missedBallots"
          from pair_comparisons pc
          join competitors left_player on left_player.id = pc.left_id
          join competitors right_player on right_player.id = pc.right_id
          where pc.magnitude > 0
        `)
      : tab === "mutual"
        ? db.execute<RelationshipTableRow>(sql`
            with ${voteOpportunityCtes(filter)},
            mutual_rows as (
              select
                case when ev.voter_id < ev.submitter_id then ev.voter_id else ev.submitter_id end as left_id,
                case when ev.voter_id < ev.submitter_id then ev.submitter_id else ev.voter_id end as right_id,
                sum(ev.points)::int as points,
                count(*)::int as opportunities,
                count(distinct ev.round_id)::int as shared_rounds,
                count(*) filter (where ev.points > 0)::int as positives
              from effective_votes ev
              group by left_id, right_id
            ),
            mutual_budget_rows as (
              select distinct
                case when ev.voter_id < ev.submitter_id then ev.voter_id else ev.submitter_id end as left_id,
                case when ev.voter_id < ev.submitter_id then ev.submitter_id else ev.voter_id end as right_id,
                ev.round_id,
                ev.voter_id,
                bt.ballot_points
              from effective_votes ev
              join ballot_totals bt
                on bt.round_id = ev.round_id
               and bt.voter_id = ev.voter_id
            ),
            mutual_budgets as (
              select
                left_id,
                right_id,
                sum(ballot_points)::double precision as eligible_ballot_points
              from mutual_budget_rows
              group by left_id, right_id
            )
            select
              mr.left_id as "leftId",
              ${competitorDisplayName("left_player")} as "leftName",
              mr.right_id as "rightId",
              ${competitorDisplayName("right_player")} as "rightName",
              mr.points,
              mr.opportunities,
              mr.shared_rounds as "sharedRounds",
              (select scope_rounds from scope_thresholds) as "scopeRounds",
              mr.points::double precision / nullif(mr.opportunities, 0) as "pointsPerOpportunity",
              mr.positives::double precision / nullif(mr.opportunities, 0) as "positiveRate",
              mr.points::double precision / nullif(mb.eligible_ballot_points, 0) as "ballotPointShare",
              null::double precision as alignment,
              null::int as "comparableFeatures",
              null::double precision as "averageTiming",
              null::int as "votedRounds",
              null::int as "missedBallots"
            from mutual_rows mr
            join mutual_budgets mb
              on mb.left_id = mr.left_id
             and mb.right_id = mr.right_id
            join competitors left_player on left_player.id = mr.left_id
            join competitors right_player on right_player.id = mr.right_id
            where mr.opportunities > 0
              and mb.eligible_ballot_points > 0
              and mr.shared_rounds >= (
                select minimum_shared_rounds from scope_thresholds
              )
              and (${focus}::uuid is null or mr.left_id = ${focus} or mr.right_id = ${focus})
          `)
        : tab === "timing"
          ? db.execute<RelationshipTableRow>(sql`
              with ${voteOpportunityCtes(filter)},
              round_ballot_counts as (
                select round_id, count(*)::int as observed_voters
                from active_ballots
                group by round_id
              ),
              ballot_positions as (
                select
                  active_ballots.*,
                  rbc.observed_voters,
                  rank() over (
                    partition by active_ballots.round_id
                    order by active_ballots.cast_at
                  )::int as ballot_rank,
                  count(*) over (
                    partition by active_ballots.round_id, active_ballots.cast_at
                  )::int as tie_count
                from active_ballots
                join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
              ),
              ranked_ballots as (
                select
                  ballot_positions.*,
                  case
                    when observed_voters = 1 then 0.5::double precision
                    else (
                      ballot_rank::double precision - 1 + tie_count::double precision / 2
                    ) / observed_voters
                  end as relative_order
                from ballot_positions
              ),
              player_scope_rounds as (
                select distinct s.submitter_id as competitor_id, s.round_id
                from submissions s
                join selected_rounds sr on sr.id = s.round_id
                union
                select distinct ab.voter_id as competitor_id, ab.round_id
                from active_ballots ab
              ),
              timing_rows as (
                select
                  psr.competitor_id,
                  avg(rb.relative_order) as average_timing,
                  count(rb.round_id)::int as voted_rounds,
                  count(*) filter (where rb.round_id is null)::int as missed_ballots,
                  count(distinct psr.round_id)::int as scope_rounds
                from player_scope_rounds psr
                left join ranked_ballots rb
                  on rb.round_id = psr.round_id
                 and rb.voter_id = psr.competitor_id
                where ${focus}::uuid is null or psr.competitor_id = ${focus}
                group by psr.competitor_id
              )
              select
                tr.competitor_id as "leftId",
                ${competitorDisplayName("c")} as "leftName",
                null::uuid as "rightId",
                null::text as "rightName",
                null::int as points,
                null::int as opportunities,
                tr.scope_rounds as "sharedRounds",
                (select scope_rounds from scope_thresholds) as "scopeRounds",
                null::double precision as "pointsPerOpportunity",
                null::double precision as "positiveRate",
                null::double precision as "ballotPointShare",
                null::double precision as alignment,
                null::int as "comparableFeatures",
                tr.average_timing as "averageTiming",
                tr.voted_rounds as "votedRounds",
                tr.missed_ballots as "missedBallots"
              from timing_rows tr
              join competitors c on c.id = tr.competitor_id
            `)
          : db.execute<RelationshipTableRow>(sql`
              with ${voteOpportunityCtes(filter)},
              relationship_rows as (
                select
                  ${tab === "received" ? sql`ev.submitter_id` : sql`ev.voter_id`} as left_id,
                  ${tab === "received" ? sql`ev.voter_id` : sql`ev.submitter_id`} as right_id,
                  sum(ev.points)::int as points,
                  count(*)::int as opportunities,
                  count(distinct ev.round_id)::int as shared_rounds,
                  count(*) filter (where ev.points > 0)::int as positives
                from effective_votes ev
                where ${focus}::uuid is null
                   or ${tab === "received" ? sql`ev.submitter_id` : sql`ev.voter_id`} = ${focus}
                group by left_id, right_id
              )
              select
                rr.left_id as "leftId",
                ${competitorDisplayName("left_player")} as "leftName",
                rr.right_id as "rightId",
                ${competitorDisplayName("right_player")} as "rightName",
                rr.points,
                rr.opportunities,
                rr.shared_rounds as "sharedRounds",
                (select scope_rounds from scope_thresholds) as "scopeRounds",
                rr.points::double precision / nullif(rr.opportunities, 0) as "pointsPerOpportunity",
                rr.positives::double precision / nullif(rr.opportunities, 0) as "positiveRate",
                null::double precision as "ballotPointShare",
                null::double precision as alignment,
                null::int as "comparableFeatures",
                null::double precision as "averageTiming",
                null::int as "votedRounds",
                null::int as "missedBallots"
              from relationship_rows rr
              join competitors left_player on left_player.id = rr.left_id
              join competitors right_player on right_player.id = rr.right_id
              where rr.shared_rounds >= (
                select minimum_shared_rounds from scope_thresholds
              )
            `);

  const [focusPlayerValue, rows] = await Promise.all([focusRowPromise, rowsPromise]);
  const filteredRows = focus
    ? rows.filter(
        (row) =>
          row.leftId === focus || row.rightId === focus || tab === "timing",
      )
    : rows;

  return {
    direction,
    focusPlayer: focusPlayerValue,
    rows: sortRelationshipRows(filteredRows, sort, direction),
    sort,
    tab,
  };
}

function jsonObject<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  if (typeof value === "object") return value as T;
  return null;
}

const EMPTY_PLAYLIST_POSITION_BIAS: SubmissionFactsData["playlistPositionBias"] =
  {
    sampleSize: 0,
    indexedRounds: 0,
    correlationPoints: null,
    correlationShare: null,
    buckets: [],
  };

export async function getSubmissionFactsData(
  filter: AnalyticsFilter,
): Promise<SubmissionFactsData> {
  const scopeCte = selectedRoundsCte(filter);
  const [row] = await db.execute<SubmissionFactsPackedQueryRow>(sql`
      with ${scopeCte},
      most_submitted_artists as (
      select
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submissions desc, submitters desc, artist asc
      limit 100
      ),
      player_artist_counts as (
        select
          s.submitter_id,
          min(s.artist_name) as artist,
          count(*)::int as submissions,
          row_number() over (
            partition by s.submitter_id
            order by count(*) desc, min(s.artist_name) asc
          ) as artist_rank
        from submissions s
        join selected_rounds sr on sr.id = s.round_id
        group by s.submitter_id, lower(trim(s.artist_name))
      ),
      artist_loyalists as (
      select
        pac.submitter_id as "playerId",
        ${competitorDisplayName("c")} as "playerName",
        pac.artist,
        pac.submissions
      from player_artist_counts pac
      join competitors c on c.id = pac.submitter_id
      where pac.artist_rank = 1 and pac.submissions > 1
      order by pac.submissions desc, "playerName" asc
      limit 100
      ),
      repeated_songs as (
      select
        s.spotify_uri as "spotifyUri",
        min(s.song_title) as title,
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters,
        count(distinct s.league_id)::int as leagues,
        count(distinct s.round_id)::int as rounds
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by s.spotify_uri
      having count(*) > 1
      order by submissions desc, submitters desc, title asc
      limit 100
      ),
      diverse_artists as (
      select
        min(s.artist_name) as artist,
        count(distinct s.submitter_id)::int as submitters,
        count(*)::int as submissions
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submitters desc, submissions desc, artist asc
      limit 100
      ),
      prolific_submitters as (
      select
        s.submitter_id as "playerId",
        ${competitorDisplayName("c")} as "playerName",
        count(*)::int as submissions,
        count(distinct lower(trim(s.artist_name)))::int as artists
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      group by s.submitter_id, c.name_override, c.name
      order by submissions desc, artists desc, "playerName" asc
      limit 100
      ),
      longest_titles as (
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${competitorDisplayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) desc, s.song_title asc
      limit 100
      ),
      shortest_titles as (
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${competitorDisplayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) asc, s.song_title asc
      limit 100
      ),
      densest_rounds as (
      select
        l.name as "leagueName",
        l.slug as "leagueSlug",
        l.music_league_id as "leagueMusicLeagueId",
        sr.name as "roundName",
        sr.ordinal as "roundOrdinal",
        sr.source_round_id as "sourceRoundId",
        count(s.id)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from selected_rounds sr
      join leagues l on l.id = sr.league_id
      left join submissions s on s.round_id = sr.id
      group by l.id, sr.id, sr.name, sr.ordinal, sr.source_round_id
      order by submissions desc, submitters desc, "leagueName" asc, "roundOrdinal" asc
      limit 100
      ),
      scope_meta as (
        select
          count(*)::int as scope_rounds,
          greatest(1, ceil(count(*)::numeric / 3)::int) as minimum_rounds
        from selected_rounds
      ),
      scoped_songs as (
        select
          ss.id,
          ss.title as song_title,
          ss.artist as artist_name,
          ss.submitter_id,
          ss.submitter_name,
          ss.league_name,
          ss.league_slug,
          ss.league_music_league_id,
          ss.round_id,
          ss.source_round_id,
          ss.round_name,
          ss.round_ordinal,
          ss.points,
          ss.eligible_rows,
          ss.positive_reach,
          ss.round_point_share,
          sub.playlist_index
        from analytics_song_stats ss
        join selected_rounds sr on sr.id = ss.round_id
        join submissions sub on sub.id = ss.id
      ),
      player_appeal as (
        select
          ss.submitter_id as "playerId",
          min(ss.submitter_name) as "playerName",
          count(*)::int as songs,
          count(distinct ss.round_id)::int as "enteredRounds",
          avg(ss.positive_reach)::double precision as "avgPositiveReach",
          avg(ss.round_point_share)::double precision as "avgRoundPointShare",
          (
            avg(ss.positive_reach) - avg(ss.round_point_share)
          )::double precision as "appealSpread"
        from scoped_songs ss
        where ss.positive_reach is not null
          and ss.round_point_share is not null
          and ss.eligible_rows >= 5
        group by ss.submitter_id
        having count(*) >= 3
          and count(distinct ss.round_id) >= (select minimum_rounds from scope_meta)
      ),
      crowd_pleaser_players as (
        select *
        from player_appeal
        where "appealSpread" > 0
        order by "appealSpread" desc, "avgPositiveReach" desc, "playerName" asc
        limit 100
      ),
      niche_devotion_players as (
        select *
        from player_appeal
        where "appealSpread" < 0
        order by "appealSpread" asc, "avgRoundPointShare" desc, "playerName" asc
        limit 100
      ),
      song_appeal as (
        select
          ss.id as "songId",
          ss.song_title as title,
          ss.artist_name as artist,
          ss.submitter_id as "submitterId",
          ss.submitter_name as "submitterName",
          ss.league_name as "leagueName",
          ss.league_slug as "leagueSlug",
          ss.league_music_league_id as "leagueMusicLeagueId",
          ss.source_round_id as "sourceRoundId",
          ss.round_name as "roundName",
          ss.round_ordinal as "roundOrdinal",
          ss.positive_reach as "positiveReach",
          ss.round_point_share as "roundPointShare",
          (
            ss.positive_reach - ss.round_point_share
          )::double precision as "appealSpread",
          ss.points
        from scoped_songs ss
        where ss.positive_reach is not null
          and ss.round_point_share is not null
          and ss.eligible_rows >= 5
      ),
      thin_spread_songs as (
        select *
        from song_appeal
        where "appealSpread" > 0
        order by "appealSpread" desc, "positiveReach" desc, title asc
        limit 100
      ),
      cult_classic_songs as (
        select *
        from song_appeal
        where "appealSpread" < 0
        order by "appealSpread" asc, "roundPointShare" desc, title asc
        limit 100
      ),
      round_share_ranks as (
        select
          ss.round_id,
          ss.league_name,
          ss.league_slug,
          ss.league_music_league_id,
          ss.source_round_id,
          ss.round_name,
          ss.round_ordinal,
          ss.song_title,
          ss.artist_name,
          ss.points,
          ss.round_point_share,
          row_number() over (
            partition by ss.round_id
            order by ss.round_point_share desc nulls last, ss.points desc, ss.id asc
          ) as share_rank,
          count(*) over (partition by ss.round_id) as songs
        from scoped_songs ss
        where ss.round_point_share is not null
      ),
      round_outliers as (
        select
          r.league_name as "leagueName",
          r.league_slug as "leagueSlug",
          r.league_music_league_id as "leagueMusicLeagueId",
          r.round_id as "roundId",
          r.source_round_id as "sourceRoundId",
          r.round_name as "roundName",
          r.round_ordinal as "roundOrdinal",
          max(r.songs)::int as songs,
          max(case when r.share_rank = 1 then r.round_point_share end)::double precision
            as "maxRoundPointShare",
          (
            max(case when r.share_rank = 1 then r.round_point_share end)
            - max(case when r.share_rank = 2 then r.round_point_share end)
          )::double precision as "topTwoShareGap",
          (
            select coalesce(
              json_agg(
                jsonb_build_object(
                  'title', t.song_title,
                  'artist', t.artist_name,
                  'points', t.points,
                  'roundPointShare', t.round_point_share
                )
                order by t.share_rank
              ),
              '[]'::json
            )
            from round_share_ranks t
            where t.round_id = r.round_id and t.share_rank <= 3
          ) as "topSongs"
        from round_share_ranks r
        where r.songs >= 3
        group by
          r.round_id,
          r.league_name,
          r.league_slug,
          r.league_music_league_id,
          r.source_round_id,
          r.round_name,
          r.round_ordinal
        having max(case when r.share_rank = 2 then r.round_point_share end) is not null
      ),
      closest_races as (
        select *
        from round_outliers
        order by "topTwoShareGap" asc, "maxRoundPointShare" asc, "leagueName" asc, "roundOrdinal" asc
        limit 100
      ),
      biggest_landslides as (
        select *
        from round_outliers
        order by "maxRoundPointShare" desc, "topTwoShareGap" desc, "leagueName" asc, "roundOrdinal" asc
        limit 100
      ),
      ordered_songs as (
        select
          ss.points,
          ss.round_point_share,
          case
            when count(*) filter (where ss.playlist_index is not null)
              over (partition by ss.round_id) <= 1
            then null
            when ss.playlist_index is null then null
            else ss.playlist_index::double precision
              / nullif(
                (
                  count(*) filter (where ss.playlist_index is not null)
                    over (partition by ss.round_id)
                  - 1
                ),
                0
              )::double precision
          end as position_percentile
        from scoped_songs ss
        where ss.playlist_index is not null
      ),
      playlist_buckets as (
        select
          case
            when position_percentile < 0.25 then '0-25%'
            when position_percentile < 0.5 then '25-50%'
            when position_percentile < 0.75 then '50-75%'
            else '75-100%'
          end as bucket,
          case
            when position_percentile < 0.25 then 0.0
            when position_percentile < 0.5 then 0.25
            when position_percentile < 0.75 then 0.5
            else 0.75
          end as "bucketMin",
          case
            when position_percentile < 0.25 then 0.25
            when position_percentile < 0.5 then 0.5
            when position_percentile < 0.75 then 0.75
            else 1.0
          end as "bucketMax",
          count(*)::int as songs,
          avg(points)::double precision as "avgPoints",
          avg(round_point_share)::double precision as "avgRoundPointShare"
        from ordered_songs
        where position_percentile is not null
        group by 1, 2, 3
      ),
      playlist_bias_stats as (
        select
          count(*)::int as "sampleSize",
          (
            select count(distinct ss.round_id)::int
            from scoped_songs ss
            where ss.playlist_index is not null
          ) as "indexedRounds",
          corr(position_percentile, points::double precision) as "correlationPoints",
          corr(position_percentile, round_point_share) as "correlationShare",
          (
            select coalesce(
              json_agg(
                jsonb_build_object(
                  'bucket', b.bucket,
                  'bucketMin', b."bucketMin",
                  'bucketMax', b."bucketMax",
                  'songs', b.songs,
                  'avgPoints', b."avgPoints",
                  'avgRoundPointShare', b."avgRoundPointShare"
                )
                order by b."bucketMin"
              ),
              '[]'::json
            )
            from playlist_buckets b
          ) as buckets
        from ordered_songs
        where position_percentile is not null
      )
      select
        (
          select coalesce(json_agg(to_jsonb(most_submitted_artists) order by submissions desc, submitters desc, artist asc), '[]'::json)
          from most_submitted_artists
        ) as "mostSubmittedArtists",
        (
          select coalesce(json_agg(to_jsonb(artist_loyalists) order by submissions desc, "playerName" asc), '[]'::json)
          from artist_loyalists
        ) as "artistLoyalists",
        (
          select coalesce(json_agg(to_jsonb(repeated_songs) order by submissions desc, submitters desc, title asc), '[]'::json)
          from repeated_songs
        ) as "repeatedSongs",
        (
          select coalesce(json_agg(to_jsonb(diverse_artists) order by submitters desc, submissions desc, artist asc), '[]'::json)
          from diverse_artists
        ) as "diverseArtists",
        (
          select coalesce(json_agg(to_jsonb(prolific_submitters) order by submissions desc, artists desc, "playerName" asc), '[]'::json)
          from prolific_submitters
        ) as "prolificSubmitters",
        (
          select coalesce(json_agg(to_jsonb(longest_titles) order by length desc, title asc), '[]'::json)
          from longest_titles
        ) as "longestTitles",
        (
          select coalesce(json_agg(to_jsonb(shortest_titles) order by length asc, title asc), '[]'::json)
          from shortest_titles
        ) as "shortestTitles",
        (
          select coalesce(json_agg(to_jsonb(densest_rounds) order by submissions desc, submitters desc, "leagueName" asc, "roundOrdinal" asc), '[]'::json)
          from densest_rounds
        ) as "densestRounds",
        (
          select coalesce(json_agg(to_jsonb(crowd_pleaser_players) order by "appealSpread" desc, "avgPositiveReach" desc, "playerName" asc), '[]'::json)
          from crowd_pleaser_players
        ) as "crowdPleaserPlayers",
        (
          select coalesce(json_agg(to_jsonb(niche_devotion_players) order by "appealSpread" asc, "avgRoundPointShare" desc, "playerName" asc), '[]'::json)
          from niche_devotion_players
        ) as "nicheDevotionPlayers",
        (
          select coalesce(json_agg(to_jsonb(thin_spread_songs) order by "appealSpread" desc, "positiveReach" desc, title asc), '[]'::json)
          from thin_spread_songs
        ) as "thinSpreadSongs",
        (
          select coalesce(json_agg(to_jsonb(cult_classic_songs) order by "appealSpread" asc, "roundPointShare" desc, title asc), '[]'::json)
          from cult_classic_songs
        ) as "cultClassicSongs",
        (
          select coalesce(json_agg(to_jsonb(closest_races) order by "topTwoShareGap" asc, "maxRoundPointShare" asc, "leagueName" asc, "roundOrdinal" asc), '[]'::json)
          from closest_races
        ) as "closestRaces",
        (
          select coalesce(json_agg(to_jsonb(biggest_landslides) order by "maxRoundPointShare" desc, "topTwoShareGap" desc, "leagueName" asc, "roundOrdinal" asc), '[]'::json)
          from biggest_landslides
        ) as "biggestLandslides",
        (
          select to_jsonb(playlist_bias_stats)
          from playlist_bias_stats
        ) as "playlistPositionBias"
    `);

  const playlistBias =
    jsonObject<SubmissionFactsData["playlistPositionBias"]>(
      row?.playlistPositionBias,
    ) ?? EMPTY_PLAYLIST_POSITION_BIAS;
  const buckets = jsonRows<
    SubmissionFactsData["playlistPositionBias"]["buckets"][number]
  >(playlistBias.buckets);

  return {
    artistLoyalists: jsonRows<SubmissionFactsData["artistLoyalists"][number]>(
      row?.artistLoyalists,
    ),
    biggestLandslides: jsonRows<
      SubmissionFactsData["biggestLandslides"][number]
    >(row?.biggestLandslides).map((race) => ({
      ...race,
      topSongs: jsonRows(race.topSongs),
    })),
    closestRaces: jsonRows<SubmissionFactsData["closestRaces"][number]>(
      row?.closestRaces,
    ).map((race) => ({
      ...race,
      topSongs: jsonRows(race.topSongs),
    })),
    crowdPleaserPlayers: jsonRows<
      SubmissionFactsData["crowdPleaserPlayers"][number]
    >(row?.crowdPleaserPlayers),
    cultClassicSongs: jsonRows<SubmissionFactsData["cultClassicSongs"][number]>(
      row?.cultClassicSongs,
    ),
    densestRounds: jsonRows<SubmissionFactsData["densestRounds"][number]>(
      row?.densestRounds,
    ),
    diverseArtists: jsonRows<SubmissionFactsData["diverseArtists"][number]>(
      row?.diverseArtists,
    ),
    longestTitles: jsonRows<SubmissionFactsData["longestTitles"][number]>(
      row?.longestTitles,
    ),
    mostSubmittedArtists: jsonRows<
      SubmissionFactsData["mostSubmittedArtists"][number]
    >(row?.mostSubmittedArtists),
    nicheDevotionPlayers: jsonRows<
      SubmissionFactsData["nicheDevotionPlayers"][number]
    >(row?.nicheDevotionPlayers),
    playlistPositionBias: { ...playlistBias, buckets },
    prolificSubmitters: jsonRows<
      SubmissionFactsData["prolificSubmitters"][number]
    >(row?.prolificSubmitters),
    repeatedSongs: jsonRows<SubmissionFactsData["repeatedSongs"][number]>(
      row?.repeatedSongs,
    ),
    shortestTitles: jsonRows<SubmissionFactsData["shortestTitles"][number]>(
      row?.shortestTitles,
    ),
    thinSpreadSongs: jsonRows<SubmissionFactsData["thinSpreadSongs"][number]>(
      row?.thinSpreadSongs,
    ),
  };
}

function analyticsFilter(leagueKey: string, roundKey: string): AnalyticsFilter {
  return {
    leagueIds: decodeScopeIds(leagueKey),
    roundIds: decodeScopeIds(roundKey),
  };
}

export function revalidateAnalyticsCache() {
  revalidateTag(ANALYTICS_CACHE_TAG, { expire: 0 });
}

export async function getCachedFilterOptions(): Promise<FilterOptions> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getFilterOptions();
}

export async function getCachedDashboardData(
  leagueKey: string,
  roundKey: string,
): Promise<DashboardData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getDashboardData(analyticsFilter(leagueKey, roundKey));
}

export async function getCachedDashboardAlignmentData(
  leagueKey: string,
  roundKey: string,
): Promise<DashboardData["alignment"]> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getDashboardAlignmentData(analyticsFilter(leagueKey, roundKey));
}

export async function getCachedSongsData(
  leagueKey: string,
  roundKey: string,
  page: number,
  pageSize: number,
  search: string,
  sort: SongSort,
  direction: SortDirection,
): Promise<SongsData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getSongsData(analyticsFilter(leagueKey, roundKey), {
    direction,
    page,
    pageSize,
    search,
    sort,
  });
}

export async function getCachedPlayersData(
  leagueKey: string,
  roundKey: string,
  search: string,
  sort: PlayerSort,
  direction: SortDirection,
): Promise<PlayersData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getPlayersData(analyticsFilter(leagueKey, roundKey), {
    direction,
    search,
    sort,
  });
}

export async function getCachedPlayerProfileData(
  playerId: string,
  leagueKey: string,
  roundKey: string,
): Promise<PlayerProfileData | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getPlayerProfileData(playerId, analyticsFilter(leagueKey, roundKey));
}

export async function getCachedRelationshipsTableData(
  leagueKey: string,
  roundKey: string,
  tab: RelationshipTab,
  sort: RelationshipSort,
  direction: SortDirection,
  focusPlayerId: string | null,
): Promise<RelationshipsTableData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getRelationshipsTableData(analyticsFilter(leagueKey, roundKey), {
    direction,
    focusPlayerId,
    sort,
    tab,
  });
}

export async function getCachedSubmissionFactsData(
  leagueKey: string,
  roundKey: string,
): Promise<SubmissionFactsData> {
  "use cache";
  cacheLife("hours");
  cacheTag(ANALYTICS_CACHE_TAG);
  return getSubmissionFactsData(analyticsFilter(leagueKey, roundKey));
}

export function filterOptionsForLeague(
  options: FilterOptions,
  leagueIds: string[],
): RoundOption[] {
  return leagueIds.length
    ? options.rounds.filter((round) => leagueIds.includes(round.leagueId))
    : options.rounds;
}

export function selectedFilterLabel(
  options: FilterOptions,
  filter: AnalyticsFilter,
): string {
  const leagues = options.leagues.filter(({ id }) => filter.leagueIds.includes(id));
  if (leagues.length === 1) return leagues[0].name;
  if (leagues.length > 1) return `${leagues.length} selected leagues`;
  return "All leagues";
}

export function mergeFilterConditions(
  left: SQL | undefined,
  right: SQL | undefined,
): SQL | undefined {
  return left && right ? and(left, right) : left ?? right;
}
