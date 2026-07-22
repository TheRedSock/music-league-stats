import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { competitors, leagues, rounds } from "@/db/schema";
import {
  createPointDistribution,
  type PointBucket,
} from "@/lib/point-buckets";

export {
  createPointDistribution,
  filterPointBuckets,
  pointBucket,
  STANDARD_POINT_LABELS,
} from "@/lib/point-buckets";
export type { PointBucket, PointBucketRange } from "@/lib/point-buckets";

export type SearchParams = Record<string, string | string[] | undefined>;

export type AnalyticsFilterRequest = {
  leagueId: string | null;
  roundId: string | null;
  useDefaultLeague: boolean;
};

export type AnalyticsFilter = {
  leagueId: string | null;
  roundId: string | null;
};

export type LeagueOption = {
  id: string;
  name: string;
  slug: string;
};

export type RoundOption = {
  id: string;
  leagueId: string;
  leagueName: string;
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
  | { status: "unavailable" };

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
  alignment: {
    leftId: string;
    leftName: string;
    rightId: string;
    rightName: string;
    alignment: number;
    comparableFeatures: number;
    sharedRounds: number;
    scopeRounds: number;
  } | null;
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
  roundId: string;
  roundName: string;
  roundOrdinal: number;
  submittedAt: string;
  points: number;
  eligibleRows: number;
  positiveRows: number;
  pointsPerEligibleVoter: number | null;
  positiveReach: number | null;
  roundPointShare: number | null;
  supportIndex: number | null;
  performancePercentile: number | null;
};

export const songSorts = [
  "title",
  "submitter",
  "scope",
  "points",
  "points-per-voter",
  "positive-reach",
  "round-share",
  "normalized-index",
  "percentile",
  "newest",
] as const;
export type SongSort = (typeof songSorts)[number];
export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

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
  ordinal: number;
  castAt: string | null;
  relativeOrder: number | null;
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function parseAnalyticsFilters(
  params: SearchParams,
): AnalyticsFilterRequest {
  const league = firstParam(params.league);
  const round = firstParam(params.round);

  return {
    leagueId: isUuid(league) ? league : null,
    roundId: isUuid(round) ? round : null,
    useDefaultLeague: league === undefined && round === undefined,
  };
}

export function resolveAnalyticsFilter(
  request: AnalyticsFilterRequest,
  options: FilterOptions,
): AnalyticsFilter {
  const requestedLeagueId = request.useDefaultLeague
    ? options.defaultLeagueId
    : request.leagueId;
  const leagueId = options.leagues.some(({ id }) => id === requestedLeagueId)
    ? requestedLeagueId
    : null;
  const requestedRound = options.rounds.find(({ id }) => id === request.roundId);
  const roundId =
    requestedRound && (!leagueId || requestedRound.leagueId === leagueId)
      ? requestedRound.id
      : null;

  return { leagueId, roundId };
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

export function defaultSongSortDirection(sort: SongSort): SortDirection {
  return sort === "title" || sort === "submitter" || sort === "scope"
    ? "asc"
    : "desc";
}

export function defaultPlayerSortDirection(sort: PlayerSort): SortDirection {
  return sort === "name" ? "asc" : "desc";
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

export function buildAnalyticsHref(
  path: string,
  current: Record<string, string | number | null | undefined>,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
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

export function supportIndex(
  songPoints: number,
  roundPoints: number,
  slateSize: number,
): number | null {
  const share = safeRatio(songPoints, roundPoints);
  return share === null || slateSize <= 0 ? null : share * slateSize;
}

export function percentileRank(values: number[], value: number): number | null {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finiteValues.length || !Number.isFinite(value)) return null;
  if (finiteValues.length === 1) return 100;
  const belowOrEqual = finiteValues.filter((candidate) => candidate <= value).length;
  return ((belowOrEqual - 1) / (finiteValues.length - 1)) * 100;
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
      .select({ id: leagues.id, name: leagues.name, slug: leagues.slug })
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

function scopePredicate(filter: AnalyticsFilter, alias: "r" | "rounds" = "r"): SQL {
  const leagueColumn =
    alias === "r" ? sql`r.league_id` : sql`rounds.league_id`;
  const roundColumn = alias === "r" ? sql`r.id` : sql`rounds.id`;
  const conditions: SQL[] = [];
  if (filter.leagueId) conditions.push(sql`${leagueColumn} = ${filter.leagueId}`);
  if (filter.roundId) conditions.push(sql`${roundColumn} = ${filter.roundId}`);
  return conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
}

function selectedRoundsCte(filter: AnalyticsFilter): SQL {
  return sql`
    selected_rounds as (
      select r.id, r.league_id, r.ordinal, r.name, r.source_created_at
      from rounds r
      where ${scopePredicate(filter)}
    )
  `;
}

function selectedLeaguesCte(filter: AnalyticsFilter): SQL {
  const conditions: SQL[] = [];
  if (filter.leagueId) conditions.push(sql`l.id = ${filter.leagueId}`);
  if (filter.roundId) {
    conditions.push(
      sql`exists (select 1 from rounds scope_round where scope_round.id = ${filter.roundId} and scope_round.league_id = l.id)`,
    );
  }
  return sql`
    selected_leagues as (
      select l.id from leagues l
      where ${conditions.length ? sql.join(conditions, sql` and `) : sql`true`}
    )
  `;
}

function competitorDisplayName(alias = "c"): SQL {
  return sql.raw(`coalesce(${alias}.name_override, ${alias}.name)`);
}

function voteOpportunityCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${selectedRoundsCte(filter)},
    scope_thresholds as (
      select
        count(*)::int as scope_rounds,
        greatest(1, ceil(count(*)::numeric / 2)::int) as minimum_shared_rounds,
        least(
          20,
          greatest(5, ceil(count(*)::numeric / 2)::int * 5)
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
    round_visible_submissions as (
      select
        s.id,
        s.league_id,
        s.round_id,
        s.submitter_id
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      where s.visible_to_voters
    ),
    eligible_vote_opportunities as (
      select
        rvs.id as submission_id,
        rvs.league_id,
        rvs.round_id,
        rvs.submitter_id,
        ab.voter_id
      from active_ballots ab
      join round_visible_submissions rvs on rvs.round_id = ab.round_id
      where rvs.submitter_id <> ab.voter_id
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

function songStatsCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${voteOpportunityCtes(filter)},
    round_submission_totals as (
      select sr.id as round_id, count(s.id) filter (where s.visible_to_voters)::int as slate_count
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
        count(ev.submission_id)::int as eligible_rows,
        count(ev.submission_id) filter (where ev.points > 0)::int as positive_rows
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      left join effective_votes ev on ev.submission_id = s.id
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
        sr.name as round_name,
        svs.points,
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
        case when rvt.round_points > 0 and rst.slate_count > 0
          then (svs.points::double precision / rvt.round_points) * rst.slate_count else null end as support_index
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      join submission_vote_stats svs on svs.submission_id = s.id
      join round_submission_totals rst on rst.round_id = sr.id
      join round_vote_totals rvt on rvt.round_id = sr.id
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
  roundId: string;
  roundName: string;
  roundOrdinal: number;
  submittedAt: Date | string;
  points: number;
  eligibleRows: number;
  positiveRows: number;
  pointsPerEligibleVoter: number | null;
  positiveReach: number | null;
  roundPointShare: number | null;
  supportIndex: number | null;
  performancePercentile: number | null;
};

function mapSong(row: SongQueryRow): SongAnalyticsRow {
  return {
    ...row,
    spotifyUrl: spotifyTrackUrl(row.spotifyUri),
    submittedAt: isoTimestamp(row.submittedAt),
  };
}

function songSelect(): SQL {
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
      ss.round_id as "roundId",
      ss.round_name as "roundName",
      ss.round_ordinal as "roundOrdinal",
      ss.submitted_at as "submittedAt",
      ss.points,
      ss.eligible_rows as "eligibleRows",
      ss.positive_rows as "positiveRows",
      ss.points_per_eligible_voter as "pointsPerEligibleVoter",
      ss.positive_reach as "positiveReach",
      ss.round_point_share as "roundPointShare",
      ss.support_index as "supportIndex",
      case
        when count(*) over (partition by ss.round_id) = 1 then 100::double precision
        else percent_rank() over (partition by ss.round_id order by ss.support_index asc nulls first) * 100
      end as "performancePercentile"
    from song_stats ss
    join competitors c on c.id = ss.submitter_id
    join leagues l on l.id = ss.league_id
  `;
}

function alignmentComparisonCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${voteOpportunityCtes(filter)},
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

export async function getDashboardData(
  filter: AnalyticsFilter,
): Promise<DashboardData> {
  const summaryPromise = db.execute<DashboardSummaryRow>(sql`
    with ${voteOpportunityCtes(filter)}, ${selectedLeaguesCte(filter)}
    select
      (select count(*)::int from selected_leagues) as "leagueCount",
      (select count(*)::int from selected_rounds) as "roundCount",
      (select count(distinct lm.competitor_id)::int from league_members lm join selected_leagues sl on sl.id = lm.league_id) as "playerCount",
      (select count(s.id)::int from submissions s join selected_rounds sr on sr.id = s.round_id) as "songCount",
      (select coalesce(sum(ev.points), 0)::int from effective_votes ev) as "pointCount"
  `);

  const leaderboardPromise = db.execute<LeaderboardQueryRow>(sql`
    with ${songStatsCtes(filter)},
    round_entrants as (
      select
        round_id,
        count(distinct submitter_id)::int as entrants
      from song_stats
      group by round_id
    ),
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        max(round_points)::double precision as round_points
      from song_stats
      group by submitter_id, round_id
    )
    select
      c.id,
      ${competitorDisplayName("c")} as name,
      sum(pr.points)::int as "totalPoints",
      avg(case when pr.round_points > 0 and re.entrants > 0
        then (pr.points::double precision / pr.round_points) * re.entrants else null end) as "normalizedIndex",
      count(*)::int as "enteredRounds"
    from player_round pr
    join round_entrants re on re.round_id = pr.round_id
    join competitors c on c.id = pr.submitter_id
    group by c.id, c.name_override, c.name
    order by "totalPoints" desc, name asc
    limit 100
  `);

  const topSongsPromise = db.execute<SongQueryRow>(sql`
    with ${songStatsCtes(filter)},
    ranked_songs as (${songSelect()})
    select * from ranked_songs
    order by "supportIndex" desc nulls last, points desc, title asc
    limit 8
  `);

  const distributionPromise = db.execute<{ points: number; count: number }>(sql`
    with ${voteOpportunityCtes(filter)}
    select ev.points, count(*)::int as count
    from effective_votes ev
    group by ev.points
    order by ev.points
  `);

  const alignmentPromise = db.execute<{
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
    limit 1
  `);

  const [summaryRows, leaderboard, topSongs, distribution, alignments] =
    await Promise.all([
      summaryPromise,
      leaderboardPromise,
      topSongsPromise,
      distributionPromise,
      alignmentPromise,
    ]);
  const summary = summaryRows[0] ?? {
    leagueCount: 0,
    roundCount: 0,
    playerCount: 0,
    songCount: 0,
    pointCount: 0,
  };

  return {
    summary: {
      leagues: summary.leagueCount,
      rounds: summary.roundCount,
      players: summary.playerCount,
      songs: summary.songCount,
      points: summary.pointCount,
    },
    leaderboard,
    topSongs: topSongs.map(mapSong),
    pointDistribution: createPointDistribution(distribution),
    alignment: alignments[0] ?? null,
  };
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
  if (sort === "normalized-index")
    return sql`"supportIndex" ${dir} ${nulls}, points desc`;
  if (sort === "percentile")
    return sql`"performancePercentile" ${dir} ${nulls}, points desc`;
  if (sort === "newest") return sql`"submittedAt" ${dir}, title asc`;
  return sql`points ${dir}, "supportIndex" desc nulls last`;
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
  const ctes = sql`${songStatsCtes(filter)}, ranked_songs as (${songSelect()})`;
  const predicate = songSearchPredicate(search);
  const [countRows, rows] = await Promise.all([
    db.execute<{ count: number }>(sql`
      with ${ctes}
      select count(*)::int as count from ranked_songs
      where ${predicate}
    `),
    db.execute<SongQueryRow>(sql`
      with ${ctes}
      select * from ranked_songs
      where ${predicate}
      order by ${songOrder(sort, direction)}
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `),
  ]);

  return {
    rows: rows.map(mapSong),
    total: countRows[0]?.count ?? 0,
    page,
    pageSize,
    search,
    sort,
    direction,
  };
}

function playerStatsCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${songStatsCtes(filter)},
    round_entrants as (
      select round_id, count(distinct submitter_id)::int as entrants
      from song_stats group by round_id
    ),
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        count(*)::int as submissions,
        sum(eligible_rows)::int as eligible_rows,
        max(round_points)::double precision as round_points
      from song_stats
      group by submitter_id, round_id
    ),
    player_round_indexed as (
      select
        pr.*,
        case when pr.round_points > 0 and re.entrants > 0
          then (pr.points::double precision / pr.round_points) * re.entrants else null end as round_index,
        case
          when count(*) over (partition by pr.round_id) = 1 then 100::double precision
          else percent_rank() over (
            partition by pr.round_id
            order by case
              when pr.round_points > 0 and re.entrants > 0
                then (pr.points::double precision / pr.round_points) * re.entrants
              else null
            end asc nulls first
          ) * 100
        end as round_percentile,
        rank() over (partition by pr.round_id order by pr.points desc) as round_rank
      from player_round pr
      join round_entrants re on re.round_id = pr.round_id
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

export async function getPlayersData(
  filter: AnalyticsFilter,
  {
    search,
    sort,
    minimumRounds,
    direction,
  }: {
    search: string;
    sort: PlayerSort;
    minimumRounds: number;
    direction: SortDirection;
  },
): Promise<PlayersData> {
  const rows = await db.execute<PlayerQueryRow>(sql`
    with ${playerStatsCtes(filter)}
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
    where ${playerSearchPredicate(search)}
    order by ${playerOrder(sort, minimumRounds, direction)}
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
  minimumRounds = 3,
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

  const directoryPromise = getPlayersData(filter, {
    search: "",
    sort: "performance",
    direction: "desc",
    minimumRounds,
  });
  const submissionsPromise = db.execute<SongQueryRow>(sql`
    with ${songStatsCtes(filter)}, ranked_songs as (${songSelect()})
    select * from ranked_songs
    where "submitterId" = ${playerId}
    order by "supportIndex" desc nulls last, points desc
  `);
  const distributionsPromise = db.execute<{
    direction: "received" | "given";
    points: number;
    count: number;
  }>(sql`
    with ${voteOpportunityCtes(filter)}
    select 'received' as direction, ev.points, count(*)::int as count
    from effective_votes ev
    where ev.submitter_id = ${playerId}
    group by ev.points
    union all
    select 'given' as direction, ev.points, count(*)::int as count
    from effective_votes ev
    where ev.voter_id = ${playerId}
    group by ev.points
  `);
  const relationshipsPromise = db.execute<DirectionalRelationship>(sql`
    with ${voteOpportunityCtes(filter)},
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
    )
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
    order by rr.direction, "pointsPerEncounter" desc, rr.encounters desc
  `);
  const mutualRelationshipsPromise = db.execute<MutualRelationship>(sql`
    with ${voteOpportunityCtes(filter)},
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
    )
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
    order by "pointsPerOpportunity" desc, mr.opportunities desc
  `);
  const alignmentsPromise = db.execute<{
    competitorId: string;
    competitorName: string;
    alignment: number;
    comparableFeatures: number;
    sharedRounds: number;
    scopeRounds: number;
  }>(sql`
    with ${alignmentComparisonCtes(filter)}
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
    order by alignment desc, "comparableFeatures" desc
  `);
  const timingPromise = db.execute<{
    roundId: string;
    roundName: string;
    leagueName: string;
    ordinal: number;
    castAt: Date | string | null;
    relativeOrder: number | null;
    observedVoters: number;
    participation: "voted" | "did_not_vote";
  }>(sql`
    with ${voteOpportunityCtes(filter)},
    round_ballot_counts as (
      select round_id, count(*)::int as observed_voters
      from active_ballots
      group by round_id
    ),
    ranked_ballots as (
      select
        active_ballots.*,
        rbc.observed_voters,
        case
          when rbc.observed_voters = 1 then 0.5::double precision
          else percent_rank() over (partition by active_ballots.round_id order by active_ballots.cast_at)
        end as relative_order
      from active_ballots
      join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
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
    )
    select
      pp.round_id as "roundId",
      sr.name as "roundName",
      l.name as "leagueName",
      sr.ordinal,
      pp.cast_at as "castAt",
      pp.relative_order as "relativeOrder",
      pp.observed_voters as "observedVoters",
      pp.participation as "participation"
    from player_participation pp
    join selected_rounds sr on sr.id = pp.round_id
    join leagues l on l.id = sr.league_id
    order by sr.source_created_at desc, pp.cast_at desc nulls last
  `);

  const [
    directory,
    submissionRows,
    distributionRows,
    relationships,
    mutualRelationships,
    alignments,
    timingRows,
  ] = await Promise.all([
    directoryPromise,
    submissionsPromise,
    distributionsPromise,
    relationshipsPromise,
    mutualRelationshipsPromise,
    alignmentsPromise,
    timingPromise,
  ]);

  return {
    player,
    overview: directory.rows.find(({ id }) => id === playerId) ?? null,
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

export function filterOptionsForLeague(
  options: FilterOptions,
  leagueId: string | null,
): RoundOption[] {
  return leagueId
    ? options.rounds.filter((round) => round.leagueId === leagueId)
    : options.rounds;
}

export function selectedFilterLabel(
  options: FilterOptions,
  filter: AnalyticsFilter,
): string {
  const round = options.rounds.find(({ id }) => id === filter.roundId);
  if (round) return `${round.leagueName} · Round ${round.ordinal}: ${round.name}`;
  return (
    options.leagues.find(({ id }) => id === filter.leagueId)?.name ??
    "All leagues"
  );
}

export function mergeFilterConditions(
  left: SQL | undefined,
  right: SQL | undefined,
): SQL | undefined {
  return left && right ? and(left, right) : left ?? right;
}
