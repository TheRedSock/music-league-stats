import { Suspense } from "react";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { SongsTableControls } from "@/components/analytics/songs-column-picker";
import { SongsTable } from "@/components/analytics/songs-table";
import { Container } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
  "positive-reach": "Voters reached",
  "round-share": "Round share",
  "support-eb": "Adjusted support",
  "points-per-actual-voter": "Average points per actual voter",
  "appeal-spread": "Reach vs share spread",
  "support-z": "Statistical surprise",
  "normalized-index": "Support index (raw)",
  percentile: "Round percentile",
  newest: "Newest",
} as const;

async function SongsPageContent({
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
    <Container className="max-w-[1500px] py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Songs
          </h1>
        </div>
        <div className="min-w-0 sm:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <div className="mt-5">
          <Form
            action="/songs"
            className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_15rem_auto]"
          >
            {filter.leagueIds.length ? (
              filter.leagueIds.map((leagueId) => (
                <input key={leagueId} name="league" type="hidden" value={leagueId} />
              ))
            ) : (
              <input name="league" type="hidden" value="all" />
            )}
            <label className="relative col-span-2 sm:col-span-1">
              <span className="sr-only">Search songs</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              />
              <input
                className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
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
                className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
                key={sort}
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
              Search
            </button>
          </Form>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-400">
          <span className="font-mono text-zinc-100">
            {data.total.toLocaleString()}
          </span>{" "}
          {data.total === 1 ? "song" : "songs"}
        </p>
        <div className="flex items-center gap-4"><p className="text-xs text-zinc-500">Page {Math.min(page, totalPages)} of {totalPages}</p><SongsTableControls /></div>
      </div>

      {data.rows.length ? (
        <Card className="mt-3 overflow-hidden">
          <CardContent className="p-0">
            <SongsTable
              currentParams={currentParams}
              direction={direction}
              rowOffset={(page - 1) * data.pageSize}
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
                : "Choose another league, or import submissions and votes."
            }
          />
        </div>
      )}

      {data.total > data.pageSize ? (
        <nav
          aria-label="Song pages"
          className="mt-4 flex items-center justify-between gap-3"
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

      <p className="mt-6 text-xs text-zinc-400">More measures are available in Columns. <Link className="underline underline-offset-4" href="/faq#song-measures">How song measures work</Link></p>
    </Container>
  );
}

export default function SongsPage(props: { searchParams: Promise<SearchParams>; }) {
  return <Suspense fallback={<AnalyticsLoadingShell />}><SongsPageContent {...props} /></Suspense>;
}
