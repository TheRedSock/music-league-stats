import { ArrowLeft, ArrowRight, ExternalLink, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import { Container } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TruncatedCell,
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  defaultSongSortDirection,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedSongsData,
  loadAnalytics,
  leagueTableLabel,
  parseAnalyticsFilters,
  parsePositiveInteger,
  parseSearch,
  parseSongSort,
  parseSongSortDirection,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  scopeQueryParams,
  truncateRoundName,
  type SearchParams,
} from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

export const metadata: Metadata = {
  title: "Songs",
  description: "Explore every imported song with round-adjusted Music League metrics.",
};

const sortLabels = {
  title: "Song title",
  submitter: "Submitter",
  scope: "League / round",
  points: "Total points",
  "points-per-voter": "Points per eligible voter",
  "positive-reach": "Positive vote reach",
  "round-share": "Round share",
  "normalized-index": "Round-normalized index",
  percentile: "Round percentile",
  newest: "Newest",
} as const;

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = parsePositiveInteger(params.page, 1, 100_000);
  const search = parseSearch(params.q);
  const sort = parseSongSort(params.sort);
  const direction = parseSongSortDirection(params.dir, sort);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedSongsData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
      page,
      25,
      search,
      sort,
      direction,
    );
    return { data, filter, options };
  });

  if (result.status !== "ready") {
    return (
      <Container className="py-16 sm:py-24">
        <AnalyticsUnavailable status={result.status} />
      </Container>
    );
  }

  const { data, filter, options } = result.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const currentParams = {
    ...scopeQueryParams(filter),
    q: search || null,
    sort,
    dir: direction,
  };
  if (data.total > 0 && page > totalPages) {
    redirect(buildAnalyticsHref("/songs", currentParams, { page: totalPages }));
  }

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Songs
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {selectedFilterLabel(options, filter)}
          </p>
        </div>
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <Card className="mt-9">
        <CardContent className="p-4 sm:p-5">
          <form
            action="/songs"
            className="grid gap-3 sm:grid-cols-[1fr_15rem_auto]"
            method="get"
          >
            {filter.leagueIds.length ? (
              filter.leagueIds.map((leagueId) => (
                <input key={leagueId} name="league" type="hidden" value={leagueId} />
              ))
            ) : (
              <input name="league" type="hidden" value="all" />
            )}
            {filter.roundIds.map((roundId) => (
              <input key={roundId} name="round" type="hidden" value={roundId} />
            ))}
            <label className="relative">
              <span className="sr-only">Search songs</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              />
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
                defaultValue={search}
                maxLength={100}
                name="q"
                placeholder="Song, artist, album, or player"
                type="search"
              />
            </label>
            <label>
              <span className="sr-only">Sort songs</span>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
                defaultValue={sort}
                name="sort"
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className={buttonStyles()} type="submit">
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-400">
          <span className="font-mono text-zinc-100">
            {data.total.toLocaleString()}
          </span>{" "}
          {data.total === 1 ? "song" : "songs"}
        </p>
        <p className="text-xs text-zinc-500">
          Page {Math.min(page, totalPages)} of {totalPages}
        </p>
      </div>

      {data.rows.length ? (
        <Card className="mt-3 overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  className="w-[24%]"
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
                  className="w-[14%]"
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
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[10%]" defaultDirection={defaultSongSortDirection("positive-reach")} params={currentParams} path="/songs" sortKey="positive-reach" title="Positive eligible opportunities divided by all eligible opportunities.">
                  Positive reach
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[9%]" defaultDirection={defaultSongSortDirection("points-per-voter")} params={currentParams} path="/songs" sortKey="points-per-voter" title="Eligible points divided by eligible voter opportunities.">
                  Pts / voter
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[9%] xl:table-cell" defaultDirection={defaultSongSortDirection("round-share")} params={currentParams} path="/songs" sortKey="round-share" title="Song points divided by all eligible points in its round.">
                  Round share
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[10%]" defaultDirection={defaultSongSortDirection("normalized-index")} params={currentParams} path="/songs" sortKey="normalized-index" title="Points received divided by expected points from the eligible ballot budgets that could reach the song.">
                  Support index
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[9%] 2xl:table-cell" defaultDirection={defaultSongSortDirection("percentile")} params={currentParams} path="/songs" sortKey="percentile">
                  Round percentile
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((song) => (
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
                          <TruncatedCell title={song.title}>{song.title}</TruncatedCell>
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
                        `/players/${song.submitterId}`,
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
                  <TableCell className="text-right font-mono">
                    {percent(song.positiveReach)}
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {song.positiveRows}/{song.eligibleRows} rows
                    </p>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {song.pointsPerEligibleVoter?.toFixed(2) ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono xl:table-cell">
                    {percent(song.roundPointShare)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-lime-200">
                    {song.supportIndex?.toFixed(2) ?? "—"}×
                  </TableCell>
                  <TableCell className="hidden text-right font-mono 2xl:table-cell">
                    {song.performancePercentile === null
                      ? "—"
                      : `${song.performancePercentile.toFixed(0)}th`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="mt-3">
          <AnalyticsEmpty
            title={search ? "No songs match this search" : "No songs in this scope"}
            description={
              search
                ? "Try a broader song, artist, album, or player name."
                : "Choose another league or round, or import submissions and votes."
            }
          />
        </div>
      )}

      {data.total > data.pageSize ? (
        <nav
          aria-label="Song pages"
          className="mt-6 flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link
              className={buttonStyles({ variant: "secondary" })}
              href={buildAnalyticsHref("/songs", currentParams, {
                page: page - 1,
              })}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {page < totalPages ? (
            <Link
              className={buttonStyles({ variant: "secondary" })}
              href={buildAnalyticsHref("/songs", currentParams, {
                page: page + 1,
              })}
            >
              Next
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </nav>
      ) : null}

      <Card className="mt-10 border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">How comparison works</CardTitle>
          <CardDescription>
            Active voters create eligible opportunities for visible songs they
            did not submit. Omitted eligible opportunities count as zero; rounds
            where a submitter did not vote do not create zeroes for that player.
            Support index compares actual song points with expected points from
            eligible ballot budgets. Index and percentile are computed against
            the full round before search and pagination are applied.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
