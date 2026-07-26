/**
 * Client-safe analytics display/sort helpers.
 * Keep this module free of server-only imports (db, next/cache, etc.).
 */

export { playerPath } from "@/lib/player-slug";

export const songSorts = [
  "title",
  "submitter",
  "scope",
  "points",
  "points-per-voter",
  "positive-reach",
  "round-share",
  "support-eb",
  "support-z",
  "normalized-index",
  "percentile",
  "newest",
] as const;
export type SongSort = (typeof songSorts)[number];

export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

export function defaultSongSortDirection(sort: SongSort): SortDirection {
  return sort === "title" || sort === "submitter" || sort === "scope"
    ? "asc"
    : "desc";
}

export function leagueTableLabel(league: { slug: string; name: string }): string {
  return league.slug || league.name;
}

export function truncateRoundName(name: string, max = 50): string {
  if (name.length <= max) return name;
  return `${name.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Soft-cap artist on dense meta lines (artist · league · R# · round).
 * Truncate artist to `artistMax` only when the full line exceeds `totalMax`,
 * so league/round keep roughly `totalMax - artistMax` characters of budget.
 */
export function truncateArtistForMeta(
  artist: string,
  leagueLabel: string,
  roundOrdinal: number,
  roundName: string,
  artistMax = 30,
  totalMax = 80,
): string {
  const scope = `${leagueLabel} · R${roundOrdinal} · ${roundName}`;
  const total = artist.length + 3 + scope.length;
  if (total > totalMax && artist.length > artistMax) {
    return `${artist.slice(0, Math.max(0, artistMax - 1)).trimEnd()}…`;
  }
  return artist;
}

export type PlayerVotedSongRow = {
  submissionId: string;
  title: string;
  artist: string;
  spotifyUri: string;
  spotifyUrl: string | null;
  submitterId: string;
  submitterSlug: string;
  submitterName: string;
  leagueId: string;
  leagueName: string;
  leagueSlug: string;
  leagueMusicLeagueId: string | null;
  roundId: string;
  sourceRoundId: string;
  roundName: string;
  roundOrdinal: number;
  /** Round start/create time from Music League export; used for chronological sort. */
  roundSourceCreatedAt: string;
  /** 0-based slate/playlist order within the round; null when missing. */
  playlistIndex: number | null;
  pointsGiven: number;
  ballotPoints: number;
  eligibleOpportunities: number;
  songsAtLeast: number;
  songPoints: number;
  songEligibleVoters: number;
  votersAtLeast: number;
  /**
   * Own-ballot concentration: multiples of that voter's fair share, diluted by
   * how many songs on the same ballot scored ≥ this vote.
   */
  ballotBlowout: number | null;
  /**
   * Vs other voters on the song: multiples of the song's fair share among
   * eligible voters, diluted by how many voters gave ≥ this score.
   */
  crowdContrast: number | null;
};

/**
 * Fair-share concentration: `points / (totalPoints / opportunities)`, diluted
 * by how many peers scored at least `points`. Used for ballot blowout (peers =
 * other songs on the voter's ballot) and crowd contrast (peers = other voters
 * on the song).
 */
export function fairShareBlowout(
  points: number,
  totalPoints: number,
  opportunities: number,
  peersAtLeast: number,
): number | null {
  if (
    !Number.isFinite(points) ||
    !Number.isFinite(totalPoints) ||
    !Number.isFinite(opportunities) ||
    !Number.isFinite(peersAtLeast) ||
    points < 0 ||
    totalPoints <= 0 ||
    opportunities <= 0 ||
    peersAtLeast <= 0
  ) {
    return null;
  }
  return (points * opportunities) / (totalPoints * peersAtLeast);
}

/** Default ranking for highest-voted songs: points, then ballot blowout, then title. */
export function compareVotedSongsByPoints(
  left: Pick<PlayerVotedSongRow, "ballotBlowout" | "pointsGiven" | "title">,
  right: Pick<PlayerVotedSongRow, "ballotBlowout" | "pointsGiven" | "title">,
): number {
  return (
    right.pointsGiven - left.pointsGiven ||
    (right.ballotBlowout ?? Number.NEGATIVE_INFINITY) -
      (left.ballotBlowout ?? Number.NEGATIVE_INFINITY) ||
    left.title.localeCompare(right.title)
  );
}
