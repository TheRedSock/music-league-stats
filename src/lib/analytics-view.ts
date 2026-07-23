/**
 * Client-safe analytics display/sort helpers.
 * Keep this module free of server-only imports (db, next/cache, etc.).
 */

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
