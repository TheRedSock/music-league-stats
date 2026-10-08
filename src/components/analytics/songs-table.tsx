"use client";

import { ordinal } from "@/lib/format";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { useSongTableColumns } from "@/components/analytics/songs-column-picker";
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
  type SongSort,
  type SortDirection,
} from "@/lib/analytics-view";
import { musicLeagueUrl } from "@/lib/music-league-urls";

import styles from "./songs-table.module.css";

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

  return (
    <Table className={styles.table}>
      <TableHeader>
        <TableRow>
          <TableHead><span className="sr-only">Row number</span></TableHead>
          <SortableTableHead
            activeDirection={direction}
            activeSort={sort}
            className={styles.songColumn}
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
            className={styles.scopeColumn}
            defaultDirection={defaultSongSortDirection("scope")}
            params={currentParams}
            path="/songs"
            sortKey="scope"
          >
            {"League /\nround"}
          </SortableTableHead>
          <SortableTableHead
            activeDirection={direction}
            activeSort={sort}
            align="right"
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
              defaultDirection={defaultSongSortDirection("positive-reach")}
              params={currentParams}
              path="/songs"
              sortKey="positive-reach"
              title="How many voters gave this song points."
            >
              {"Voters\nreached"}
            </SortableTableHead>
          ) : null}
          {isVisible("points-per-voter") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("points-per-voter")}
              params={currentParams}
              path="/songs"
              sortKey="points-per-voter"
              title="Average points from everyone who could vote for the song, including zeroes."
            >
              {"Pts /\nvoter"}
            </SortableTableHead>
          ) : null}
          {isVisible("points-per-actual-voter") ? (
            <SortableTableHead activeDirection={direction} activeSort={sort} align="right" defaultDirection={defaultSongSortDirection("points-per-actual-voter")} params={currentParams} path="/songs" sortKey="points-per-actual-voter" title="Average points from the people who gave this song points.">
              {"Avg pts /\nactual voter"}
            </SortableTableHead>
          ) : null}
          {isVisible("round-share") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("round-share")}
              params={currentParams}
              path="/songs"
              sortKey="round-share"
              title="How much of the round’s points went to this song."
            >
              {"Round\nshare"}
            </SortableTableHead>
          ) : null}
          {isVisible("support-eb") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("support-eb")}
              params={currentParams}
              path="/songs"
              sortKey="support-eb"
              title="Support compared with an even share of the available points. Above 1× is stronger; small samples are adjusted toward 1×."
            >
              {"Adjusted\nsupport"}
            </SortableTableHead>
          ) : null}
          {isVisible("appeal-spread") ? (
            <SortableTableHead activeDirection={direction} activeSort={sort} align="right" defaultDirection={defaultSongSortDirection("appeal-spread")} params={currentParams} path="/songs" sortKey="appeal-spread" title="Positive: points spread across more voters. Negative: stronger backing from fewer voters.">
              {"Reach vs\nshare spread"}
            </SortableTableHead>
          ) : null}
          {isVisible("support-z") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("support-z")}
              params={currentParams}
              path="/songs"
              sortKey="support-z"
              title="How far the score was above or below expectations, allowing for round size."
            >
              {"Statistical\nsurprise"}
            </SortableTableHead>
          ) : null}
          {isVisible("normalized-index") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("normalized-index")}
              params={currentParams}
              path="/songs"
              sortKey="normalized-index"
              title="Support compared with an even share of the available points, without the small-sample adjustment."
            >
              {"Support\n(raw)"}
            </SortableTableHead>
          ) : null}
          {isVisible("percentile") ? (
            <SortableTableHead
              activeDirection={direction}
              activeSort={sort}
              align="right"
              defaultDirection={defaultSongSortDirection("percentile")}
              params={currentParams}
              path="/songs"
              sortKey="percentile"
            >
              {"Round\npercentile"}
            </SortableTableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((song, index) => (
          <TableRow key={song.id}>
            <TableCell className="font-mono text-zinc-500">{rowOffset + index + 1}</TableCell>
            <TableCell className={styles.songColumn}>
              <div className={styles.songContent} title={`${song.title} — ${song.artist}`}>
                <div className="flex min-w-0 items-baseline">
                  <p className={`${styles.songTitle} truncate font-medium leading-5 text-zinc-100`}>
                    {song.spotifyUrl ? (
                      <a aria-label={`${song.title} — ${song.artist}, open on Spotify`} className="hover:text-lime-200" href={song.spotifyUrl} rel="noreferrer" target="_blank">
                        {song.title}<ExternalLink aria-hidden="true" className="ml-1 inline size-3" />
                      </a>
                    ) : <>{song.title}<span className="sr-only"> — {song.artist}</span></>}
                  </p>
                  <p aria-hidden="true" className={`${styles.artist} text-sm leading-5 text-zinc-400`}>
                    <span className={styles.artistLabel}>
                      <span className="px-1.5 text-zinc-600">—</span>{song.artist}
                    </span>
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Link
                className="text-zinc-200 hover:text-lime-200"
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
            <TableCell className={styles.scopeColumn}>
              <div className={styles.scopeContent}>
                <div className="flex min-w-0 items-baseline gap-1">
                  <MusicLeagueLink
                    className={`${styles.leagueLink} text-zinc-300`}
                    href={musicLeagueUrl(song.leagueMusicLeagueId)}
                    showIcon={false}
                    title={song.leagueName}
                  >
                    {leagueTableLabel({
                      name: song.leagueName,
                      slug: song.leagueSlug,
                    })}
                  </MusicLeagueLink>
                  <span className="text-zinc-600" aria-hidden="true">/</span>
                  <MusicLeagueLink
                    className={`${styles.roundLink} text-xs text-zinc-500`}
                    href={musicLeagueUrl(
                      song.leagueMusicLeagueId,
                      song.sourceRoundId,
                    )}
                    showIcon={false}
                    title={`Round ${song.roundOrdinal}: ${song.roundName}`}
                  >
                    <span className={styles.roundLabel}>
                      <span className="shrink-0">R{song.roundOrdinal}</span>
                      <span className={styles.roundName}> · {song.roundName}</span>
                    </span>
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
  );
}
