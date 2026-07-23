import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { SongsTable } from "@/components/analytics/songs-table";
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
  buildAnalyticsHref,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedSongsData,
  loadAnalytics,
  parseAnalyticsFilters,
  parsePositiveInteger,
  parseSearch,
  parseSongSort,
  parseSongSortDirection,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  scopeQueryParams,
  type SearchParams,
} from "@/lib/analytics";

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
  "support-eb": "Support index (EB)",
  "support-z": "Support z",
  "normalized-index": "Support index (raw)",
  percentile: "Round percentile",
  newest: "Newest",
} as const;

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
        <AnalyticsUnavailable
          progressLabel={result.status === "building" ? result.progressLabel : null}
          status={result.status}
        />
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
          <CardContent className="p-0">
            <SongsTable
              currentParams={currentParams}
              direction={direction}
              rows={data.rows}
              sort={sort}
            />
          </CardContent>
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
            Raw support index compares actual points with expected points from
            eligible ballot budgets. Support index (EB) shrinks that ratio toward
            1.0 using sample-size variance estimated from the corpus, so
            small-room extremes are not overweighted in cross-round rankings.
            Support z is the standardized surplus under the same variance model.
            Use Columns to show raw support index or round percentile.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
