import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { competitors, leagues, rounds } from "@/db/schema";

export type SearchParams = Record<string, string | string[] | undefined>;

export type AnalyticsFilterRequest = {
  leagueId: string | null;
  roundId: string | null;
};

export type AnalyticsFilter = AnalyticsFilterRequest;

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
};

export type AnalyticsLoad<T> =
  | { status: "ready"; data: T }
  | { status: "setup" }
  | { status: "unavailable" };

export type PointBucket = {
  label: "0" | "1" | "2" | "3" | "4" | "5" | "5+";
  count: number;
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
  alignment: {
    leftId: string;
    leftName: string;
    rightId: string;
    rightName: string;
    alignment: number;
    commonSongs: number;
    sharedRounds: number;
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
  "points",
  "points-per-voter",
  "positive-reach",
  "normalized-index",
  "newest",
] as const;
export type SongSort = (typeof songSorts)[number];

export type SongsData = {
  rows: SongAnalyticsRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SongSort;
  search: string;
};

export const playerSorts = ["performance", "points", "rounds", "name"] as const;
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
  provisional: boolean;
};

export type PlayersData = {
  rows: PlayerDirectoryRow[];
  sort: PlayerSort;
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
  pointsPerEncounter: number;
  positiveRate: number;
};

export type TimingRow = {
  roundId: string;
  roundName: string;
  leagueName: string;
  ordinal: number;
  castAt: string;
  relativeOrder: number;
  observedVoters: number;
};

export type PlayerProfileData = {
  player: { id: string; name: string };
  overview: PlayerDirectoryRow | null;
  submissions: SongAnalyticsRow[];
  receivedDistribution: PointBucket[];
  givenDistribution: PointBucket[];
  relationships: DirectionalRelationship[];
  alignments: Array<{
    competitorId: string;
    competitorName: string;
    alignment: number;
    commonSongs: number;
    sharedRounds: number;
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
  };
}

export function resolveAnalyticsFilter(
  request: AnalyticsFilterRequest,
  options: FilterOptions,
): AnalyticsFilter {
  const leagueId = options.leagues.some(({ id }) => id === request.leagueId)
    ? request.leagueId
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

export function pointBucket(points: number): PointBucket["label"] {
  if (points <= 0) return "0";
  if (points >= 6) return "5+";
  return String(Math.floor(points)) as PointBucket["label"];
}

export function createPointDistribution(
  rows: Array<{ points: number; count?: number }>,
): PointBucket[] {
  const labels: PointBucket["label"][] = ["0", "1", "2", "3", "4", "5", "5+"];
  const totals = new Map(labels.map((label) => [label, 0]));
  for (const row of rows) {
    const label = pointBucket(row.points);
    totals.set(label, (totals.get(label) ?? 0) + (row.count ?? 1));
  }
  return labels.map((label) => ({ label, count: totals.get(label) ?? 0 }));
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
      .orderBy(asc(leagues.name)),
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

  return { leagues: leagueRows, rounds: roundRows };
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

function songStatsCtes(filter: AnalyticsFilter): SQL {
  return sql`
    ${selectedRoundsCte(filter)},
    round_submission_totals as (
      select sr.id as round_id, count(s.id)::int as slate_count
      from selected_rounds sr
      left join submissions s on s.round_id = sr.id
      group by sr.id
    ),
    round_vote_totals as (
      select sr.id as round_id, coalesce(sum(v.points), 0)::int as round_points
      from selected_rounds sr
      left join votes v on v.round_id = sr.id
      group by sr.id
    ),
    submission_vote_stats as (
      select
        s.id as submission_id,
        coalesce(sum(v.points), 0)::int as points,
        count(v.id) filter (where v.voter_id <> s.submitter_id)::int as eligible_rows,
        count(v.id) filter (where v.voter_id <> s.submitter_id and v.points > 0)::int as positive_rows
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      left join votes v on v.submission_id = s.id
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
      c.name as "submitterName",
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

export async function getDashboardData(
  filter: AnalyticsFilter,
): Promise<DashboardData> {
  const summaryPromise = db.execute<DashboardSummaryRow>(sql`
    with ${selectedRoundsCte(filter)}, ${selectedLeaguesCte(filter)}
    select
      (select count(*)::int from selected_leagues) as "leagueCount",
      (select count(*)::int from selected_rounds) as "roundCount",
      (select count(distinct lm.competitor_id)::int from league_members lm join selected_leagues sl on sl.id = lm.league_id) as "playerCount",
      (select count(s.id)::int from submissions s join selected_rounds sr on sr.id = s.round_id) as "songCount",
      (select coalesce(sum(v.points), 0)::int from votes v join selected_rounds sr on sr.id = v.round_id) as "pointCount"
  `);

  const leaderboardPromise = db.execute<LeaderboardQueryRow>(sql`
    with ${selectedRoundsCte(filter)},
    round_vote_totals as (
      select
        sr.id as round_id,
        coalesce(sum(v.points), 0)::double precision as round_points
      from selected_rounds sr
      left join votes v on v.round_id = sr.id
      group by sr.id
    ),
    round_entrants as (
      select
        sr.id as round_id,
        count(distinct s.submitter_id)::int as entrants
      from selected_rounds sr
      left join submissions s on s.round_id = sr.id
      group by sr.id
    ),
    submission_points as (
      select s.id, s.round_id, s.submitter_id, coalesce(sum(v.points), 0)::int as points
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      left join votes v on v.submission_id = s.id
      group by s.id, s.round_id, s.submitter_id
    ),
    player_round as (
      select sp.submitter_id, sp.round_id, sum(sp.points)::int as points
      from submission_points sp
      group by sp.submitter_id, sp.round_id
    )
    select
      c.id,
      c.name,
      sum(pr.points)::int as "totalPoints",
      avg(case when rvt.round_points > 0 and re.entrants > 0
        then (pr.points::double precision / rvt.round_points) * re.entrants else null end) as "normalizedIndex",
      count(*)::int as "enteredRounds"
    from player_round pr
    join round_vote_totals rvt on rvt.round_id = pr.round_id
    join round_entrants re on re.round_id = pr.round_id
    join competitors c on c.id = pr.submitter_id
    group by c.id, c.name
    order by "totalPoints" desc, c.name asc
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
    with ${selectedRoundsCte(filter)}
    select v.points, count(*)::int as count
    from votes v
    join selected_rounds sr on sr.id = v.round_id
    group by v.points
    order by v.points
  `);

  const alignmentPromise = db.execute<{
    leftId: string;
    leftName: string;
    rightId: string;
    rightName: string;
    alignment: number;
    commonSongs: number;
    sharedRounds: number;
  }>(sql`
    with ${selectedRoundsCte(filter)},
    pairs as (
      select
        v1.voter_id as left_id,
        v2.voter_id as right_id,
        count(*)::int as common_songs,
        count(distinct v1.round_id)::int as shared_rounds,
        sum(v1.points::double precision * v2.points) as dot,
        sqrt(sum(v1.points::double precision * v1.points) * sum(v2.points::double precision * v2.points)) as magnitude
      from votes v1
      join selected_rounds sr on sr.id = v1.round_id
      join votes v2 on v2.submission_id = v1.submission_id and v2.voter_id > v1.voter_id
      join submissions s on s.id = v1.submission_id
      where s.submitter_id <> v1.voter_id and s.submitter_id <> v2.voter_id
      group by v1.voter_id, v2.voter_id
      having count(*) >= 20 and count(distinct v1.round_id) >= 3
    )
    select
      pairs.left_id as "leftId",
      left_player.name as "leftName",
      pairs.right_id as "rightId",
      right_player.name as "rightName",
      pairs.dot / nullif(pairs.magnitude, 0) as alignment,
      pairs.common_songs as "commonSongs",
      pairs.shared_rounds as "sharedRounds"
    from pairs
    join competitors left_player on left_player.id = pairs.left_id
    join competitors right_player on right_player.id = pairs.right_id
    where pairs.magnitude > 0
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

function songOrder(sort: SongSort): SQL {
  if (sort === "points-per-voter")
    return sql`"pointsPerEligibleVoter" desc nulls last, points desc`;
  if (sort === "positive-reach")
    return sql`"positiveReach" desc nulls last, points desc`;
  if (sort === "normalized-index")
    return sql`"supportIndex" desc nulls last, points desc`;
  if (sort === "newest") return sql`"submittedAt" desc, title asc`;
  return sql`points desc, "supportIndex" desc nulls last`;
}

export async function getSongsData(
  filter: AnalyticsFilter,
  {
    page,
    pageSize = 25,
    search,
    sort,
  }: { page: number; pageSize?: number; search: string; sort: SongSort },
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
      order by ${songOrder(sort)}
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
          else percent_rank() over (partition by pr.round_id order by pr.points asc) * 100
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
};

function playerSearchPredicate(search: string): SQL {
  return search ? sql`c.name ilike ${`%${search}%`}` : sql`true`;
}

function playerOrder(sort: PlayerSort, minimumRounds: number): SQL {
  const provisional = sql`case when pa.entered_rounds >= ${minimumRounds} then 0 else 1 end`;
  if (sort === "points")
    return sql`${provisional}, pa.total_points desc, c.name asc`;
  if (sort === "rounds")
    return sql`${provisional}, pa.entered_rounds desc, pa.total_points desc`;
  if (sort === "name") return sql`c.name asc`;
  return sql`${provisional}, pa.average_round_index desc nulls last, pa.entered_rounds desc`;
}

export async function getPlayersData(
  filter: AnalyticsFilter,
  {
    search,
    sort,
    minimumRounds,
  }: { search: string; sort: PlayerSort; minimumRounds: number },
): Promise<PlayersData> {
  const rows = await db.execute<PlayerQueryRow>(sql`
    with ${playerStatsCtes(filter)}
    select
      c.id,
      c.name,
      pa.total_points as "totalPoints",
      pa.submissions,
      pa.entered_rounds as "enteredRounds",
      case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
      case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
      pa.average_round_index as "averageRoundIndex",
      pa.average_round_percentile as "averageRoundPercentile",
      pa.round_wins as "roundWins",
      case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate"
    from player_aggregates pa
    join competitors c on c.id = pa.submitter_id
    where ${playerSearchPredicate(search)}
    order by ${playerOrder(sort, minimumRounds)}
  `);

  return {
    rows: rows.map((row) => ({
      ...row,
      provisional: row.enteredRounds < minimumRounds,
    })),
    sort,
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
    .select({ id: competitors.id, name: competitors.name })
    .from(competitors)
    .where(eq(competitors.id, playerId))
    .limit(1);
  const player = playerRows[0];
  if (!player) return null;

  const directoryPromise = getPlayersData(filter, {
    search: "",
    sort: "performance",
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
    with ${selectedRoundsCte(filter)}
    select 'received' as direction, v.points, count(*)::int as count
    from votes v
    join selected_rounds sr on sr.id = v.round_id
    join submissions s on s.id = v.submission_id
    where s.submitter_id = ${playerId} and v.voter_id <> ${playerId}
    group by v.points
    union all
    select 'given' as direction, v.points, count(*)::int as count
    from votes v
    join selected_rounds sr on sr.id = v.round_id
    join submissions s on s.id = v.submission_id
    where v.voter_id = ${playerId} and s.submitter_id <> ${playerId}
    group by v.points
  `);
  const relationshipsPromise = db.execute<DirectionalRelationship>(sql`
    with ${selectedRoundsCte(filter)},
    relationship_rows as (
      select
        'received'::text as direction,
        v.voter_id as competitor_id,
        sum(v.points)::int as points,
        count(*)::int as encounters,
        count(distinct v.round_id)::int as shared_rounds,
        count(*) filter (where v.points > 0)::int as positives
      from votes v
      join selected_rounds sr on sr.id = v.round_id
      join submissions s on s.id = v.submission_id
      where s.submitter_id = ${playerId} and v.voter_id <> ${playerId}
      group by v.voter_id
      union all
      select
        'given'::text as direction,
        s.submitter_id as competitor_id,
        sum(v.points)::int as points,
        count(*)::int as encounters,
        count(distinct v.round_id)::int as shared_rounds,
        count(*) filter (where v.points > 0)::int as positives
      from votes v
      join selected_rounds sr on sr.id = v.round_id
      join submissions s on s.id = v.submission_id
      where v.voter_id = ${playerId} and s.submitter_id <> ${playerId}
      group by s.submitter_id
    )
    select
      rr.direction,
      rr.competitor_id as "competitorId",
      c.name as "competitorName",
      rr.points,
      rr.encounters,
      rr.shared_rounds as "sharedRounds",
      rr.points::double precision / rr.encounters as "pointsPerEncounter",
      rr.positives::double precision / rr.encounters as "positiveRate"
    from relationship_rows rr
    join competitors c on c.id = rr.competitor_id
    order by rr.direction, "pointsPerEncounter" desc, rr.encounters desc
  `);
  const alignmentsPromise = db.execute<{
    competitorId: string;
    competitorName: string;
    alignment: number;
    commonSongs: number;
    sharedRounds: number;
  }>(sql`
    with ${selectedRoundsCte(filter)},
    comparisons as (
      select
        other.voter_id as competitor_id,
        count(*)::int as common_songs,
        count(distinct mine.round_id)::int as shared_rounds,
        sum(mine.points::double precision * other.points) as dot,
        sqrt(sum(mine.points::double precision * mine.points) * sum(other.points::double precision * other.points)) as magnitude
      from votes mine
      join selected_rounds sr on sr.id = mine.round_id
      join votes other on other.submission_id = mine.submission_id and other.voter_id <> mine.voter_id
      join submissions s on s.id = mine.submission_id
      where mine.voter_id = ${playerId}
        and s.submitter_id <> ${playerId}
        and s.submitter_id <> other.voter_id
      group by other.voter_id
      having count(*) >= 20 and count(distinct mine.round_id) >= 3
    )
    select
      comparisons.competitor_id as "competitorId",
      c.name as "competitorName",
      comparisons.dot / nullif(comparisons.magnitude, 0) as alignment,
      comparisons.common_songs as "commonSongs",
      comparisons.shared_rounds as "sharedRounds"
    from comparisons
    join competitors c on c.id = comparisons.competitor_id
    where comparisons.magnitude > 0
    order by alignment desc, "commonSongs" desc
  `);
  const timingPromise = db.execute<{
    roundId: string;
    roundName: string;
    leagueName: string;
    ordinal: number;
    castAt: Date | string;
    relativeOrder: number;
    observedVoters: number;
  }>(sql`
    with ${selectedRoundsCte(filter)},
    ballots as (
      select v.round_id, v.voter_id, max(v.cast_at) as cast_at
      from votes v
      join selected_rounds sr on sr.id = v.round_id
      group by v.round_id, v.voter_id
    ),
    ranked_ballots as (
      select
        ballots.*,
        count(*) over (partition by ballots.round_id)::int as observed_voters,
        case
          when count(*) over (partition by ballots.round_id) = 1 then 0.5::double precision
          else percent_rank() over (partition by ballots.round_id order by ballots.cast_at)
        end as relative_order
      from ballots
    )
    select
      rb.round_id as "roundId",
      sr.name as "roundName",
      l.name as "leagueName",
      sr.ordinal,
      rb.cast_at as "castAt",
      rb.relative_order as "relativeOrder",
      rb.observed_voters as "observedVoters"
    from ranked_ballots rb
    join selected_rounds sr on sr.id = rb.round_id
    join leagues l on l.id = sr.league_id
    where rb.voter_id = ${playerId}
    order by rb.cast_at desc
  `);

  const [
    directory,
    submissionRows,
    distributionRows,
    relationships,
    alignments,
    timingRows,
  ] = await Promise.all([
    directoryPromise,
    submissionsPromise,
    distributionsPromise,
    relationshipsPromise,
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
    alignments,
    timing: timingRows.map((row) => ({
      ...row,
      castAt: isoTimestamp(row.castAt),
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
