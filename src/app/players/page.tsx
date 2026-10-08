import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import { Search } from "lucide-react";
import type { Metadata } from "next";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { PlayersTable, PlayersTableControls } from "@/components/analytics/players-table";
import { Container } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
} from "@/components/ui/card";
import {
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedPlayersData,
  loadAnalytics,
  parseAnalyticsFilters,
  parsePlayerSort,
  parsePlayerSortDirection,
  parseSearch,
  resolveAnalyticsFilter,
  scopeQueryParams,
  type SearchParams,
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Players",
  description: "Compare Music League players with round-local performance metrics.",
};

const sortLabels = {
  performance: "Round-adjusted performance",
  points: "Total points",
  songs: "Submitted songs",
  rounds: "Entered rounds",
  name: "Name",
  "points-per-song": "Points per song",
  "points-per-voter": "Points per eligible voter",
  percentile: "Average percentile",
  wins: "Round wins",
  "top-quartile": "Top quartile rate",
  "appeal-spread": "Reach vs share spread",
} as const;

async function PlayersPageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = parseSearch(params.q);
  const sort = parsePlayerSort(params.sort);
  const direction = parsePlayerSortDirection(params.dir, sort);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedPlayersData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
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
  const currentParams = {
    ...scopeQueryParams(filter),
    q: search || null,
    sort,
    dir: direction,
  };

  return (
    <Container className="py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Players
          </h1>

        </div>
        <div className="min-w-0 sm:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <div className="mt-5">
          <Form
            action="/players"
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
              <span className="sr-only">Search players</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              />
              <input
                className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
                defaultValue={search}
                maxLength={100}
                name="q"
                placeholder="Player name"
                type="search"
              />
            </label>
            <label>
              <span className="sr-only">Sort players</span>
              <select
                className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/40"
                key={sort}
                defaultValue={sort}
                name="sort"
              >
                {Object.entries(sortLabels).map(([option, label]) => (
                  <option key={option} value={option}>
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

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm text-zinc-400"><span className="font-mono text-zinc-100">{data.rows.length}</span> {data.rows.length === 1 ? "player" : "players"}</p>
          <p className="text-xs text-zinc-500">Average round index requires {data.minimumRounds} rounds. <Link href="/faq#rankings" className="underline underline-offset-4">Why?</Link></p>
        </div>
        <PlayersTableControls />
      </div>

      {data.rows.length ? (
        <Card className="mt-3 overflow-hidden">
          <PlayersTable currentParams={currentParams} direction={direction} rows={data.rows} sort={sort} />
        </Card>
      ) : (
        <div className="mt-3">
          <AnalyticsEmpty
            description={
              search
                ? "Try a broader player name."
                : "Choose another scope, or import submissions and votes."
            }
            title={search ? "No players match this search" : "No players in this scope"}
          />
        </div>
      )}


    </Container>
  );
}

export default function PlayersPage(props: { searchParams: Promise<SearchParams>; }) {
  return <Suspense fallback={<AnalyticsLoadingShell />}><PlayersPageContent {...props} /></Suspense>;
}
