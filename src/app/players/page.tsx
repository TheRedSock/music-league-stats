import { Search } from "lucide-react";
import type { Metadata } from "next";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { PlayersTable } from "@/components/analytics/players-table";
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
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedPlayersData,
  loadAnalytics,
  parseAnalyticsFilters,
  parsePlayerSort,
  parsePlayerSortDirection,
  parseSearch,
  resolveAnalyticsFilter,
  selectedFilterLabel,
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

export default async function PlayersPage({
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
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Players
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
            action="/players"
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
              <span className="sr-only">Search players</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              />
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
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
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/40"
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
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          <span className="font-mono text-zinc-100">{data.rows.length}</span>{" "}
          {data.rows.length === 1 ? "player" : "players"}
        </p>
        <p className="text-xs text-zinc-500">
          {`Fewer than ${data.minimumRounds} entered rounds (adaptive scope minimum) is marked provisional; avg round index shows as — until then`}
        </p>
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

      <Card className="mt-10 border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Participation and comparison</CardTitle>
          <CardDescription>
            A player is ranked only after the selected minimum number of
            entered rounds (adaptive to the scope). Provisional is a sample-size label,
            not a quality judgment. Round wins include ties; top-quartile rate
            uses each round&apos;s local point percentile. Reach vs share spread
            uses the same qualified player population as Facts. Columns lets
            you add average percentile and top quartile, which start hidden.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
