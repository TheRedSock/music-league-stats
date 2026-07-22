import { ArrowLeft, ArrowRight, ExternalLink, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  getFilterOptions,
  getSongsData,
  loadAnalytics,
  parseAnalyticsFilters,
  parsePositiveInteger,
  parseSearch,
  parseSongSort,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  type SearchParams,
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Songs",
  description: "Explore every imported song with round-adjusted Music League metrics.",
};

export const dynamic = "force-dynamic";

const sortLabels = {
  points: "Total points",
  "points-per-voter": "Points per recorded voter",
  "positive-reach": "Positive vote reach",
  "normalized-index": "Round-normalized index",
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
  const result = await loadAnalytics(async () => {
    const options = await getFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getSongsData(filter, { page, search, sort });
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
    league: filter.leagueId,
    round: filter.roundId,
    q: search || null,
    sort,
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
        <div className="w-full lg:max-w-xl">
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
            {filter.leagueId ? (
              <input name="league" type="hidden" value={filter.leagueId} />
            ) : null}
            {filter.roundId ? (
              <input name="round" type="hidden" value={filter.roundId} />
            ) : null}
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
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-64 bg-zinc-950/95">
                  Song
                </TableHead>
                <TableHead>Submitter</TableHead>
                <TableHead>League / round</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right" title="Positive recorded eligible vote rows divided by all recorded eligible vote rows.">
                  Positive reach
                </TableHead>
                <TableHead className="text-right" title="Exported points divided by recorded eligible voter rows.">
                  Pts / voter
                </TableHead>
                <TableHead className="text-right" title="Song points divided by all exported points in its round.">
                  Round share
                </TableHead>
                <TableHead className="text-right" title="Round point share divided by the equal-share slate baseline; 1.0 is round average.">
                  Support index
                </TableHead>
                <TableHead className="text-right">Round percentile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((song) => (
                <TableRow key={song.id}>
                  <TableCell className="sticky left-0 z-10 bg-zinc-950/95">
                    <div className="max-w-72">
                      <p className="truncate font-medium text-zinc-100">
                        {song.spotifyUrl ? (
                          <a
                            className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
                            href={song.spotifyUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <span className="truncate">{song.title}</span>
                            <ExternalLink
                              aria-label="Open on Spotify"
                              className="size-3 shrink-0"
                            />
                          </a>
                        ) : (
                          song.title
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
                      className="whitespace-nowrap text-zinc-200 hover:text-lime-200"
                      href={buildAnalyticsHref(
                        `/players/${song.submitterId}`,
                        currentParams,
                        { q: null, sort: null },
                      )}
                    >
                      {song.submitterName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <p className="whitespace-nowrap text-zinc-300">
                      {song.leagueName}
                    </p>
                    <p className="mt-0.5 max-w-52 truncate text-xs text-zinc-500">
                      R{song.roundOrdinal} · {song.roundName}
                    </p>
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
                  <TableCell className="text-right font-mono">
                    {percent(song.roundPointShare)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-lime-200">
                    {song.supportIndex?.toFixed(2) ?? "—"}×
                  </TableCell>
                  <TableCell className="text-right font-mono">
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
            Points and positive reach use only recorded eligible voter rows;
            the submitter is excluded from those denominators where identifiable.
            Missing rows are not zeros. Support index and percentile are
            computed against the full round before search and pagination are
            applied.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
