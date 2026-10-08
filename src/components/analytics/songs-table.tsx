"use client";

import { ordinal } from "@/lib/format";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

import {
  useSongTableColumns,
  SONG_TABLE_COLUMN_IDS,
} from "@/components/analytics/songs-column-picker";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import type { SongAnalyticsRow } from "@/lib/analytics";
import {
  buildAnalyticsHref,
  type QueryValue,
} from "@/lib/analytics-url";
import {
  defaultSongSortDirection,
  leagueTableLabel,
  playerPath,
  truncateRoundName,
  type SongSort,
  type SortDirection,
} from "@/lib/analytics-view";
import { musicLeagueUrl } from "@/lib/music-league-urls";

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function SongsTable({
  currentParams,
  direction,
  rows,
  sort,
  rowOffset = 0,
}: {
  currentParams: Record<string, QueryValue>;
  direction: SortDirection;
  rows: SongAnalyticsRow[];
  sort: SongSort;
  rowOffset?: number;
}) {
  const { isVisible: savedVisible } = useSongTableColumns();

  const isVisible = (column: Parameters<typeof savedVisible>[0]) => savedVisible(column) || sort === column;

  const visibleColumnCount = SONG_TABLE_COLUMN_IDS.filter(isVisible).length;

  return (
    <div>
      <div className="overflow-x-auto">
        <Table className="table-fixed [&_td]:py-2.5" style={{ minWidth: 840 + visibleColumnCount * 120 }}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14"><span className="sr-only">Row number</span></TableHead>
              <SortableTableHead
                activeDirection={direction}
                activeSort={sort}
                className="w-[38%]"
                defaultDirection={defaultSongSortDirection("title")}
                params={currentParams}
                path="/songs"
                sortKey="title"
              >
                Song
              </SortableTableHead>
              <SortableTableHead
                activeDirection={direction}
                activeSort={sort}
                className="w-[12%]"
                defaultDirection={defaultSongSortDirection("submitter")}
                params={currentParams}
                path="/songs"
                sortKey="submitter"
              >
                Submitter
              </SortableTableHead>
              <SortableTableHead
                activeDirection={direction}
                activeSort={sort}
                className="w-[26%]"
                defaultDirection={defaultSongSortDirection("scope")}
                params={currentParams}
                path="/songs"
                sortKey="scope"
              >
                League / round
              </SortableTableHead>
              <SortableTableHead
                activeDirection={direction}
                activeSort={sort}
                align="right"
                className="w-20"
                defaultDirection={defaultSongSortDirection("points")}
                params={currentParams}
                path="/songs"
                sortKey="points"
              >
                Points
              </SortableTableHead>
              {isVisible("positive-reach") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("positive-reach")}
                  params={currentParams}
                  path="/songs"
                  sortKey="positive-reach"
                  title="How many voters gave this song points."
                >
                  Voters reached
                </SortableTableHead>
              ) : null}
              {isVisible("points-per-voter") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("points-per-voter")}
                  params={currentParams}
                  path="/songs"
                  sortKey="points-per-voter"
                  title="Average points from everyone who could vote for the song, including zeroes."
                >
                  Pts / voter
                </SortableTableHead>
              ) : null}
              {isVisible("points-per-actual-voter") ? (
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-32" defaultDirection={defaultSongSortDirection("points-per-actual-voter")} params={currentParams} path="/songs" sortKey="points-per-actual-voter" title="Average points from the people who gave this song points.">
                  Avg pts / actual voter
                </SortableTableHead>
              ) : null}
              {isVisible("round-share") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("round-share")}
                  params={currentParams}
                  path="/songs"
                  sortKey="round-share"
                  title="How much of the round’s points went to this song."
                >
                  Round share
                </SortableTableHead>
              ) : null}
              {isVisible("support-eb") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("support-eb")}
                  params={currentParams}
                  path="/songs"
                  sortKey="support-eb"
                  title="Support compared with an even share of the available points. Above 1× is stronger; small samples are adjusted toward 1×."
                >
                  Adjusted support
                </SortableTableHead>
              ) : null}
              {isVisible("appeal-spread") ? (
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-32" defaultDirection={defaultSongSortDirection("appeal-spread")} params={currentParams} path="/songs" sortKey="appeal-spread" title="Positive: points spread across more voters. Negative: stronger backing from fewer voters.">
                  Reach vs share spread
                </SortableTableHead>
              ) : null}
              {isVisible("support-z") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("support-z")}
                  params={currentParams}
                  path="/songs"
                  sortKey="support-z"
                  title="How far the score was above or below expectations, allowing for round size."
                >
                  Statistical surprise
                </SortableTableHead>
              ) : null}
              {isVisible("normalized-index") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("normalized-index")}
                  params={currentParams}
                  path="/songs"
                  sortKey="normalized-index"
                  title="Support compared with an even share of the available points, without the small-sample adjustment."
                >
                  Support (raw)
                </SortableTableHead>
              ) : null}
              {isVisible("percentile") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-32"
                  defaultDirection={defaultSongSortDirection("percentile")}
                  params={currentParams}
                  path="/songs"
                  sortKey="percentile"
                >
                  Round percentile
                </SortableTableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((song, index) => (
              <TableRow key={song.id}>
                <TableCell className="font-mono text-zinc-500">{rowOffset + index + 1}</TableCell>
                <TableCell>
                  <div className="min-w-0 lg:flex lg:items-baseline lg:gap-1.5" title={`${song.title} — ${song.artist}`}>
                    <p className="min-w-0 truncate font-medium leading-5 text-zinc-100">
                      {song.spotifyUrl ? <a className="hover:text-lime-200" href={song.spotifyUrl} rel="noreferrer" target="_blank">{song.title}<ExternalLink aria-label="Open on Spotify" className="ml-1 inline size-3" /></a> : song.title}
                    </p>
                    <span className="hidden shrink-0 text-zinc-600 lg:inline" aria-hidden="true">—</span>
                    <p className="min-w-0 truncate text-sm leading-5 text-zinc-400 lg:max-w-[45%]">{song.artist}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Link
                    className="block truncate text-zinc-200 hover:text-lime-200"
                    href={buildAnalyticsHref(
                      playerPath({
                        id: song.submitterId,
                        slug: song.submitterSlug,
                      }),
                      currentParams,
                      { dir: null, q: null, sort: null },
                    )}
                  >
                    <span title={song.submitterName}>{song.submitterName}</span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-0 min-w-0">
                  <div className="min-w-0 lg:flex lg:items-baseline lg:gap-1.5">
                    <div className="min-w-0 shrink-0">
                      <MusicLeagueLink
                        className="text-zinc-300"
                        href={musicLeagueUrl(song.leagueMusicLeagueId)}
                        showIcon={false}
                        title={song.leagueName}
                      >
                        {leagueTableLabel({
                          name: song.leagueName,
                          slug: song.leagueSlug,
                        })}
                      </MusicLeagueLink>
                    </div>
                    <span className="hidden text-zinc-600 lg:inline" aria-hidden="true">/</span>
                    <div className="min-w-0">
                      <MusicLeagueLink
                        className="text-xs text-zinc-500"
                        href={musicLeagueUrl(
                          song.leagueMusicLeagueId,
                          song.sourceRoundId,
                        )}
                        title={song.roundName}
                      >
                        R{song.roundOrdinal} ·{" "}
                        {truncateRoundName(song.roundName)}
                      </MusicLeagueLink>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-white">
                  {song.points}
                </TableCell>
                {isVisible("positive-reach") ? (
                  <TableCell className="text-right font-mono" title={`${song.positiveRows} of ${song.eligibleRows} voters gave points`}>
                    <span aria-label={`${percent(song.positiveReach)}, ${song.positiveRows} of ${song.eligibleRows} voters gave points`}>{percent(song.positiveReach)}</span>
                  </TableCell>
                ) : null}
                {isVisible("points-per-voter") ? (
                  <TableCell className="text-right font-mono">
                    {song.pointsPerEligibleVoter?.toFixed(2) ?? "—"}
                  </TableCell>
                ) : null}
                {isVisible("points-per-actual-voter") ? (
                  <TableCell className="text-right font-mono">
                    {song.pointsPerActualVoter?.toFixed(2) ?? "—"}
                  </TableCell>
                ) : null}
                {isVisible("round-share") ? (
                  <TableCell className="text-right font-mono">
                    {percent(song.roundPointShare)}
                  </TableCell>
                ) : null}
                {isVisible("support-eb") ? (
                  <TableCell className="text-right font-mono text-lime-200">
                    {song.supportIndexEb?.toFixed(2) ?? "—"}×
                  </TableCell>
                ) : null}
                {isVisible("appeal-spread") ? (
                  <TableCell className="text-right font-mono">
                    {song.appealSpread == null ? "—" : `${song.appealSpread > 0 ? "+" : ""}${song.appealSpread.toFixed(1)} pp`}
                  </TableCell>
                ) : null}
                {isVisible("support-z") ? (
                  <TableCell className="text-right font-mono">
                    {song.supportZ?.toFixed(2) ?? "—"}
                  </TableCell>
                ) : null}
                {isVisible("normalized-index") ? (
                  <TableCell className="text-right font-mono">
                    {song.supportIndex?.toFixed(2) ?? "—"}×
                  </TableCell>
                ) : null}
                {isVisible("percentile") ? (
                  <TableCell className="text-right font-mono">
                    {song.performancePercentile === null
                      ? "—"
                      : ordinal(song.performancePercentile)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
