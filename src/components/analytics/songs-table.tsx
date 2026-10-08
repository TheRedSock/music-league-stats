"use client";

import { ordinal } from "@/lib/format";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

import {
  SongsColumnPicker,
  useSongTableColumns,
} from "@/components/analytics/songs-column-picker";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TruncatedCell,
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
}: {
  currentParams: Record<string, QueryValue>;
  direction: SortDirection;
  rows: SongAnalyticsRow[];
  sort: SongSort;
}) {
  const { columns, isVisible, toggle } = useSongTableColumns();

  return (
    <div>
      <div className="flex justify-end px-4 py-3 sm:px-5">
        <SongsColumnPicker columns={columns} onToggle={toggle} />
      </div>
      <div className="overflow-x-auto border-t border-white/[0.06]">
        <Table className="table-fixed" style={{ minWidth: 640 + columns.length * 100 }}>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                activeDirection={direction}
                activeSort={sort}
                className="w-[22%]"
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
                className="w-[11%]"
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
                className="w-[13%]"
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
                className="w-[7%]"
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
                  className="w-[9%]"
                  defaultDirection={defaultSongSortDirection("positive-reach")}
                  params={currentParams}
                  path="/songs"
                  sortKey="positive-reach"
                  title="Share of eligible song-voter opportunities awarded at least one point; includes zeroes in the denominator."
                >
                  Positive reach
                </SortableTableHead>
              ) : null}
              {isVisible("points-per-voter") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[8%]"
                  defaultDirection={defaultSongSortDirection("points-per-voter")}
                  params={currentParams}
                  path="/songs"
                  sortKey="points-per-voter"
                  title="Eligible points divided by eligible voter opportunities."
                >
                  Pts / voter
                </SortableTableHead>
              ) : null}
              {isVisible("points-per-actual-voter") ? (
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[10%]" defaultDirection={defaultSongSortDirection("points-per-actual-voter")} params={currentParams} path="/songs" sortKey="points-per-actual-voter" title="Points divided by voters who awarded at least one point. No actual voters gives 0.">
                  Avg pts / actual voter
                </SortableTableHead>
              ) : null}
              {isVisible("round-share") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[8%]"
                  defaultDirection={defaultSongSortDirection("round-share")}
                  params={currentParams}
                  path="/songs"
                  sortKey="round-share"
                  title="Song points divided by all eligible points in its round."
                >
                  Round share
                </SortableTableHead>
              ) : null}
              {isVisible("support-eb") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[10%]"
                  defaultDirection={defaultSongSortDirection("support-eb")}
                  params={currentParams}
                  path="/songs"
                  sortKey="support-eb"
                  title="Empirical-Bayes shrunk support index. Shrinks noisy small-sample extremes toward 1.0 using Var(SI)=τ²+φ/E estimated from the corpus."
                >
                  Support (EB)
                </SortableTableHead>
              ) : null}
              {isVisible("appeal-spread") ? (
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[10%]" defaultDirection={defaultSongSortDirection("appeal-spread")} params={currentParams} path="/songs" sortKey="appeal-spread" title="Reach percentile minus round-share percentile across qualifying songs in this scope (at least 5 eligible voters), in percentage points. Positive = thin spread; negative = cult classic.">
                  Reach vs share spread
                </SortableTableHead>
              ) : null}
              {isVisible("support-z") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[8%]"
                  defaultDirection={defaultSongSortDirection("support-z")}
                  params={currentParams}
                  path="/songs"
                  sortKey="support-z"
                  title="Standardized surplus vs expected points: (points − expected) / sqrt(φ · expected)."
                >
                  Support z
                </SortableTableHead>
              ) : null}
              {isVisible("normalized-index") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[9%]"
                  defaultDirection={defaultSongSortDirection("normalized-index")}
                  params={currentParams}
                  path="/songs"
                  sortKey="normalized-index"
                  title="Raw support index: points divided by expected points from eligible ballot budgets."
                >
                  Support (raw)
                </SortableTableHead>
              ) : null}
              {isVisible("percentile") ? (
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  align="right"
                  className="w-[9%]"
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
            {rows.map((song) => (
              <TableRow key={song.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-100">
                      {song.spotifyUrl ? (
                        <a
                          className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
                          href={song.spotifyUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="truncate" title={song.title}>
                            {song.title}
                          </span>
                          <ExternalLink
                            aria-label="Open on Spotify"
                            className="size-3 shrink-0"
                          />
                        </a>
                      ) : (
                        <TruncatedCell title={song.title}>
                          {song.title}
                        </TruncatedCell>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {song.artist}
                      {song.album ? ` · ${song.album}` : ""}
                    </p>
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
                  <div className="min-w-0 space-y-0.5">
                    <div className="min-w-0">
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
                  <TableCell className="text-right font-mono">
                    {percent(song.positiveReach)}
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {song.positiveRows}/{song.eligibleRows} rows
                    </p>
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
