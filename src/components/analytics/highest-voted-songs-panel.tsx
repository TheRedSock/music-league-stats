"use client";

import { ExternalLink, ListMusic } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MusicLeagueScopeLinks } from "@/components/analytics/music-league-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildAnalyticsHref, type QueryValue } from "@/lib/analytics-url";
import {
  compareVotedSongsByPoints,
  leagueTableLabel,
  truncateRoundName,
  type PlayerVotedSongRow,
  type SortDirection,
} from "@/lib/analytics-view";
import { musicLeagueUrl } from "@/lib/music-league-urls";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 5;

type SortKey =
  | "points"
  | "ballotBlowout"
  | "crowdContrast"
  | "title"
  | "submitter"
  | "round";

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

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

function compareRows(
  left: PlayerVotedSongRow,
  right: PlayerVotedSongRow,
  sort: SortKey,
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

function SortHeader({
  active,
  align = "left",
  children,
  className,
  direction,
  onClick,
  title,
}: {
  active: boolean;
  align?: "left" | "right";
  children: string;
  className?: string;
  direction: SortDirection;
  onClick: () => void;
  title?: string;
}) {
  return (
    <TableHead
      aria-sort={
        active ? (direction === "desc" ? "descending" : "ascending") : "none"
      }
      className={cn(align === "right" && "text-right", className)}
      title={title}
    >
      <button
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-lime-200 focus-visible:ring-2 focus-visible:ring-lime-300/40",
          align === "right" && "justify-end",
          active && "text-lime-200",
        )}
        onClick={onClick}
        type="button"
      >
        <span>{children}</span>
        {active ? (
          <span aria-hidden="true" className="font-mono text-[10px]">
            {direction === "desc" ? "v" : "^"}
          </span>
        ) : null}
      </button>
    </TableHead>
  );
}

function SongTitle({ row }: { row: PlayerVotedSongRow }) {
  if (!row.spotifyUrl) {
    return <span className="truncate">{row.title}</span>;
  }
  return (
    <a
      className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
      href={row.spotifyUrl}
      rel="noreferrer"
      target="_blank"
    >
      <span className="truncate">{row.title}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function VotedSongMeta({
  filterParams,
  row,
}: {
  filterParams: Record<string, QueryValue>;
  row: PlayerVotedSongRow;
}) {
  return (
    <p className="mt-0.5 truncate text-xs text-zinc-500">
      {row.artist} ·{" "}
      <Link
        className="hover:text-lime-200"
        href={buildAnalyticsHref(`/players/${row.submitterId}`, filterParams, {})}
      >
        {row.submitterName}
      </Link>{" "}
      ·{" "}
      <MusicLeagueScopeLinks
        leagueHref={musicLeagueUrl(row.leagueMusicLeagueId)}
        leagueLabel={leagueTableLabel({
          name: row.leagueName,
          slug: row.leagueSlug,
        })}
        leagueTitle={row.leagueName}
        roundHref={musicLeagueUrl(row.leagueMusicLeagueId, row.sourceRoundId)}
        roundLabel={
          <>
            R{row.roundOrdinal} · {truncateRoundName(row.roundName)}
          </>
        }
        roundTitle={row.roundName}
      />
    </p>
  );
}

export function HighestVotedSongsPanel({
  filterParams,
  playerName,
  rows,
}: {
  filterParams: Record<string, QueryValue>;
  playerName: string;
  rows: PlayerVotedSongRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [minPoints, setMinPoints] = useState(0);
  const [sort, setSort] = useState<SortKey>("points");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const preview = rows.slice(0, PREVIEW_LIMIT);
  const query = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (row.pointsGiven < minPoints) return false;
    if (!query) return true;
    return (
      row.title.toLowerCase().includes(query) ||
      row.artist.toLowerCase().includes(query) ||
      row.submitterName.toLowerCase().includes(query) ||
      row.roundName.toLowerCase().includes(query) ||
      row.leagueName.toLowerCase().includes(query)
    );
  });
  const sorted = [...filtered].sort((left, right) =>
    compareRows(left, right, sort, direction),
  );

  function toggleSort(next: SortKey) {
    if (sort === next) {
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(next);
    setDirection(next === "title" || next === "submitter" ? "asc" : "desc");
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <ListMusic aria-hidden="true" className="mb-2 size-5 text-lime-300" />
        <CardTitle>Highest votes given</CardTitle>
        <CardDescription>
          {`Songs ${playerName} scored most highly. Ties on points break by ballot blowout — how far the vote sat above a fair share of that player's own ballot that round. Crowd contrast is the same idea versus other voters on the song.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.length ? (
          <ol className="divide-y divide-white/[0.06]">
            {preview.map((row) => (
              <li
                className="flex items-center justify-between gap-4 py-3"
                key={`${row.submissionId}-${row.pointsGiven}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    <SongTitle row={row} />
                  </p>
                  <VotedSongMeta filterParams={filterParams} row={row} />
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm text-lime-200">
                    {row.pointsGiven} pts
                  </p>
                  <p className="text-[11px] text-zinc-600">
                    ballot {metric(row.ballotBlowout)}×
                    {row.crowdContrast !== null
                      ? ` · crowd ${metric(row.crowdContrast)}×`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm leading-6 text-zinc-500">
            No positive votes given in this scope.
          </p>
        )}

        {rows.length ? (
          <>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setOpen(true)}
              size="sm"
              variant="secondary"
            >
              View all ({rows.length})
            </Button>
            <Dialog
              className="max-w-6xl"
              description="Filter and sort every song this player gave points to. Ballot blowout uses that player's round ballot; crowd contrast compares the same vote to other voters on the song."
              onClose={() => setOpen(false)}
              open={open}
              title="Highest votes given"
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Search
                    </span>
                    <input
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Song, artist, submitter, round…"
                      value={search}
                    />
                  </label>
                  <label className="space-y-1.5 sm:w-40">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Min points
                    </span>
                    <select
                      className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none [color-scheme:dark] focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20"
                      onChange={(event) =>
                        setMinPoints(Number(event.target.value))
                      }
                      value={minPoints}
                    >
                      {[0, 1, 2, 3, 4, 5].map((value) => (
                        <option
                          className="bg-zinc-950 text-zinc-100"
                          key={value}
                          value={value}
                        >
                          {value === 0 ? "Any" : `${value}+`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="text-xs text-zinc-500">
                  {`Showing ${sorted.length} of ${rows.length}${
                    sort === "points"
                      ? " · sorted by points (ballot blowout tiebreak)"
                      : sort === "round"
                        ? " · sorted by round date (playlist position tiebreak)"
                        : ` · sorted by ${sort}`
                  }`}
                </p>

                {sorted.length ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <SortHeader
                          active={sort === "title"}
                          className="w-[22%]"
                          direction={direction}
                          onClick={() => toggleSort("title")}
                        >
                          Song
                        </SortHeader>
                        <SortHeader
                          active={sort === "submitter"}
                          className="w-[12%]"
                          direction={direction}
                          onClick={() => toggleSort("submitter")}
                        >
                          Submitter
                        </SortHeader>
                        <SortHeader
                          active={sort === "round"}
                          className="w-[30%]"
                          direction={direction}
                          onClick={() => toggleSort("round")}
                          title="Sort by round date; ties break by playlist position within the round"
                        >
                          Round
                        </SortHeader>
                        <SortHeader
                          active={sort === "points"}
                          align="right"
                          className="w-[8%]"
                          direction={direction}
                          onClick={() => toggleSort("points")}
                        >
                          Points
                        </SortHeader>
                        <SortHeader
                          active={sort === "ballotBlowout"}
                          align="right"
                          className="w-[14%]"
                          direction={direction}
                          onClick={() => toggleSort("ballotBlowout")}
                          title="Outlier vs this player's other votes that round: multiples of fair share on their ballot, diluted by tied top scores"
                        >
                          Ballot
                        </SortHeader>
                        <SortHeader
                          active={sort === "crowdContrast"}
                          align="right"
                          className="w-[14%]"
                          direction={direction}
                          onClick={() => toggleSort("crowdContrast")}
                          title="Outlier vs other voters on this song: multiples of the song's fair share, diluted by how many voters gave ≥ this score"
                        >
                          Crowd
                        </SortHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((row) => (
                        <TableRow key={row.submissionId}>
                          <TableCell className="max-w-0">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-100">
                                <SongTitle row={row} />
                              </p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                {row.artist}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-0">
                            <Link
                              className="block truncate hover:text-lime-200"
                              href={buildAnalyticsHref(
                                `/players/${row.submitterId}`,
                                filterParams,
                                {},
                              )}
                            >
                              {row.submitterName}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-0 overflow-hidden">
                            <div
                              className="w-full min-w-0 truncate"
                              title={`${row.leagueName} · R${row.roundOrdinal} ${row.roundName}`}
                            >
                              <MusicLeagueScopeLinks
                                leagueHref={musicLeagueUrl(
                                  row.leagueMusicLeagueId,
                                )}
                                leagueLabel={leagueTableLabel({
                                  name: row.leagueName,
                                  slug: row.leagueSlug,
                                })}
                                leagueTitle={row.leagueName}
                                roundHref={musicLeagueUrl(
                                  row.leagueMusicLeagueId,
                                  row.sourceRoundId,
                                )}
                                roundLabel={
                                  <>
                                    R{row.roundOrdinal} · {row.roundName}
                                  </>
                                }
                                roundTitle={row.roundName}
                                showIcon={false}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.pointsGiven}
                          </TableCell>
                          <TableCell className="text-right font-mono text-lime-200">
                            {metric(row.ballotBlowout)}×
                          </TableCell>
                          <TableCell className="text-right font-mono text-zinc-300">
                            {metric(row.crowdContrast)}×
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No songs match these filters.
                  </p>
                )}
              </div>
            </Dialog>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
