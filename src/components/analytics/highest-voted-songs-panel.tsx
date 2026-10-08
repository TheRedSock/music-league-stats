"use client";

import { formatPoints } from "@/lib/format";


import { ExternalLink, ListMusic } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type VoteSortKey, type VotedSongsPage } from "@/lib/voted-songs";

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
  leagueTableLabel,
  playerPath,
  truncateRoundName,
  type PlayerVotedSongRow,
  type SortDirection,
} from "@/lib/analytics-view";
import { musicLeagueUrl } from "@/lib/music-league-urls";
import { tableColumnHelp } from "@/lib/table-help";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 5;

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
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
      title={title ?? tableColumnHelp(children)}
    >
      <button
        title={title ?? tableColumnHelp(children)}
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
        href={buildAnalyticsHref(
          playerPath({ id: row.submitterId, slug: row.submitterSlug }),
          filterParams,
          {},
        )}
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
  playerId,
  total,
}: {
  filterParams: Record<string, QueryValue>;
  playerName: string;
  playerId: string;
  total: number;
  rows: PlayerVotedSongRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [minPoints, setMinPoints] = useState(0);
  const [sort, setSort] = useState<VoteSortKey>("points");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<VotedSongsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const preview = rows.slice(0, PREVIEW_LIMIT);
  const endpoint = buildAnalyticsHref(`/api/players/${playerId}/votes`, filterParams, { search, minPoints: String(minPoints), sort, direction, page: String(page) });
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(endpoint, { signal: abort.signal });
        if (!response.ok) throw new Error(response.status === 503 ? "Analytics are being refreshed. Try again shortly." : "The songs could not be loaded.");
        const data: VotedSongsPage = await response.json();
        if (!abort.signal.aborted) setResult(data);
      } catch (caught) {
        if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "The songs could not be loaded.");
      } finally { if (!abort.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [endpoint, open, retry]);
  const sorted = result?.rows ?? [];

  function toggleSort(next: VoteSortKey) {
    setPage(1);
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
          {`Songs ${playerName} scored most highly.`} <Link className="underline underline-offset-4" href="/faq#vote-details">How ties are ranked</Link>
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
                    {formatPoints(row.pointsGiven)}
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

        {total ? (
          <>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setOpen(true)}
              size="sm"
              variant="secondary"
            >
              View all ({total})
            </Button>
            <Dialog
              className="max-w-6xl"
              description="Search by song, artist, submitter or round. Ballot and crowd compare the vote with each group’s fair share."
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
                      onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                      placeholder="Song, artist, submitter, round…"
                      maxLength={160}
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
                        { setMinPoints(Number(event.target.value)); setPage(1); }
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

                <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
                  <p className="text-xs text-zinc-400">{loading || !result ? "Loading songs…" : `${result.total} ${result.total === 1 ? "song" : "songs"} · Page ${result.page} of ${result.pageCount}`}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={loading || !result || result.page <= 1} onClick={() => setPage(Math.max(1, (result?.page ?? 1)-1))}>Previous</Button>
                    <Button size="sm" variant="secondary" disabled={loading || !result || result.page >= result.pageCount} onClick={() => setPage((result?.page ?? 1)+1)}>Next</Button>
                  </div>
                </div>
                {error ? <div role="alert" className="text-sm text-red-300">{error} <button className="underline" onClick={() => setRetry(value => value+1)}>Retry</button></div> : null}

                {!error && sorted.length ? (
                  <Table className="min-w-[48rem] table-fixed">
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
                          title="Points this player awarded to the song on their ballot."
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
                                playerPath({
                                  id: row.submitterId,
                                  slug: row.submitterSlug,
                                }),
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
                    {loading || !result || error ? "" : "No songs match these filters."}
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
