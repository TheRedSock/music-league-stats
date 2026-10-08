import { compareVotedSongsByPoints, type PlayerVotedSongRow, type SortDirection } from "@/lib/analytics-view";
export type VoteSortKey =
  | "points"
  | "ballotBlowout"
  | "crowdContrast"
  | "title"
  | "submitter"
  | "round";

function compareMetricDesc(
  left: number | null,
  right: number | null,
  leftPoints: number,
  rightPoints: number,
  leftTitle: string,
  rightTitle: string,
): number {
  return (
    (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY) ||
    rightPoints - leftPoints ||
    leftTitle.localeCompare(rightTitle)
  );
}

export function compareVotedRows(
  left: PlayerVotedSongRow,
  right: PlayerVotedSongRow,
  sort: VoteSortKey,
  direction: SortDirection,
): number {
  let primary = 0;
  if (sort === "points") {
    primary = compareVotedSongsByPoints(left, right);
  } else if (sort === "ballotBlowout") {
    primary = compareMetricDesc(
      left.ballotBlowout,
      right.ballotBlowout,
      left.pointsGiven,
      right.pointsGiven,
      left.title,
      right.title,
    );
  } else if (sort === "crowdContrast") {
    primary = compareMetricDesc(
      left.crowdContrast,
      right.crowdContrast,
      left.pointsGiven,
      right.pointsGiven,
      left.title,
      right.title,
    );
  } else if (sort === "submitter") {
    primary =
      left.submitterName.localeCompare(right.submitterName) ||
      compareVotedSongsByPoints(left, right);
  } else if (sort === "round") {
    const leftTime = Date.parse(left.roundSourceCreatedAt);
    const rightTime = Date.parse(right.roundSourceCreatedAt);
    const leftMs = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
    const rightMs = Number.isFinite(rightTime)
      ? rightTime
      : Number.NEGATIVE_INFINITY;
    const leftPlaylist = left.playlistIndex ?? Number.POSITIVE_INFINITY;
    const rightPlaylist = right.playlistIndex ?? Number.POSITIVE_INFINITY;
    // Date follows the active direction; playlist position stays earliest-first.
    const dateCmp =
      direction === "desc" ? rightMs - leftMs : leftMs - rightMs;
    return (
      dateCmp ||
      leftPlaylist - rightPlaylist ||
      left.roundOrdinal - right.roundOrdinal ||
      left.leagueName.localeCompare(right.leagueName) ||
      compareVotedSongsByPoints(left, right)
    );
  } else {
    primary =
      left.title.localeCompare(right.title) ||
      compareVotedSongsByPoints(left, right);
  }

  const naturalDesc =
    sort === "points" ||
    sort === "ballotBlowout" ||
    sort === "crowdContrast";
  if (naturalDesc) {
    return direction === "desc" ? primary : -primary;
  }
  return direction === "asc" ? primary : -primary;
}

export const voteSortKeys = ["points", "ballotBlowout", "crowdContrast", "title", "submitter", "round"] as const;
export function selectVotedSongs(rows: PlayerVotedSongRow[], options: { search: string; minPoints: number; sort: VoteSortKey; direction: SortDirection; page: number }) {
  const query = options.search.trim().toLowerCase();
  const filtered = rows.filter(row => row.pointsGiven >= options.minPoints && (!query || [row.title,row.artist,row.submitterName,row.roundName,row.leagueName].some(value => value.toLowerCase().includes(query))));
  filtered.sort((left,right) => compareVotedRows(left,right,options.sort,options.direction));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const page = Math.min(pageCount, Math.max(1, options.page));
  return { rows: filtered.slice((page-1)*25,page*25), total: filtered.length, page, pageCount };
}
export type VotedSongsPage = ReturnType<typeof selectVotedSongs>;
