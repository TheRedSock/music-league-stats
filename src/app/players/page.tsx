import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
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
  TruncatedCell,
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  defaultPlayerSortDirection,
  getCachedFilterOptions,
  getCachedPlayersData,
  loadAnalytics,
  parseAnalyticsFilters,
  parsePlayerSort,
  parsePlayerSortDirection,
  parsePositiveInteger,
  parseSearch,
  resolveAnalyticsFilter,
  selectedFilterLabel,
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
} as const;

function value(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export default function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<AnalyticsLoadingShell />}>
      <PlayersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PlayersContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = parseSearch(params.q);
  const sort = parsePlayerSort(params.sort);
  const direction = parsePlayerSortDirection(params.dir, sort);
  const minimumRounds = parsePositiveInteger(params.min, 3, 20);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedPlayersData(
      filter.leagueId,
      filter.roundId,
      search,
      sort,
      minimumRounds,
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
  const currentParams = {
    league: filter.leagueId ?? "all",
    round: filter.roundId,
    q: search || null,
    sort,
    dir: direction,
    min: minimumRounds,
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
        <div className="w-full lg:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <Card className="mt-9">
        <CardContent className="p-4 sm:p-5">
          <form
            action="/players"
            className="grid gap-3 sm:grid-cols-[1fr_15rem_9rem_auto]"
            method="get"
          >
            <input
              name="league"
              type="hidden"
              value={filter.leagueId ?? "all"}
            />
            {filter.roundId ? (
              <input name="round" type="hidden" value={filter.roundId} />
            ) : null}
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
            <label className="text-xs text-zinc-500">
              <span className="sr-only">Minimum rounds for ranked status</span>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/40"
                defaultValue={minimumRounds}
                name="min"
                title="Minimum entered rounds for non-provisional status"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((rounds) => (
                  <option key={rounds} value={rounds}>
                    {rounds}+ rounds
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
          Fewer than {minimumRounds} entered rounds is marked provisional
        </p>
      </div>

      {data.rows.length ? (
        <Card className="mt-3 overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Rank</TableHead>
                <SortableTableHead
                  activeDirection={direction}
                  activeSort={sort}
                  className="w-[18%]"
                  defaultDirection={defaultPlayerSortDirection("name")}
                  params={currentParams}
                  path="/players"
                  sortKey="name"
                >
                  Player
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[9%]" defaultDirection={defaultPlayerSortDirection("points")} params={currentParams} path="/players" sortKey="points">
                  Points
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[8%]" defaultDirection={defaultPlayerSortDirection("songs")} params={currentParams} path="/players" sortKey="songs">
                  Songs
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[8%]" defaultDirection={defaultPlayerSortDirection("rounds")} params={currentParams} path="/players" sortKey="rounds">
                  Rounds
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[9%] xl:table-cell" defaultDirection={defaultPlayerSortDirection("points-per-song")} params={currentParams} path="/players" sortKey="points-per-song" title="Eligible points received divided by submitted songs.">
                  Pts / song
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[9%] xl:table-cell" defaultDirection={defaultPlayerSortDirection("points-per-voter")} params={currentParams} path="/players" sortKey="points-per-voter" title="Eligible points received divided by eligible vote opportunities.">
                  Pts / voter
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[12%]" defaultDirection={defaultPlayerSortDirection("performance")} params={currentParams} path="/players" sortKey="performance" title="Average of round-local actual points divided by expected points from eligible ballot budgets.">
                  Avg round index
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[10%] 2xl:table-cell" defaultDirection={defaultPlayerSortDirection("percentile")} params={currentParams} path="/players" sortKey="percentile">
                  Avg percentile
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="w-[7%]" defaultDirection={defaultPlayerSortDirection("wins")} params={currentParams} path="/players" sortKey="wins">
                  Wins
                </SortableTableHead>
                <SortableTableHead activeDirection={direction} activeSort={sort} align="right" className="hidden w-[10%] lg:table-cell" defaultDirection={defaultPlayerSortDirection("top-quartile")} params={currentParams} path="/players" sortKey="top-quartile">
                  Top quartile
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-mono text-zinc-600">
                      {player.performanceRank === null
                        ? "—"
                        : String(player.performanceRank).padStart(2, "0")}
                    </TableCell>
                    <TableCell>
                      <Link
                        className="block truncate font-medium text-zinc-100 hover:text-lime-200"
                        href={buildAnalyticsHref(
                          `/players/${player.id}`,
                          currentParams,
                          { dir: null, q: null, sort: null, min: null },
                        )}
                      >
                        <TruncatedCell title={player.name}>{player.name}</TruncatedCell>
                      </Link>
                      {player.provisional ? (
                        <Badge className="mt-1" variant="muted">
                          Provisional
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-white">
                      {player.totalPoints.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {player.submissions}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {player.enteredRounds}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono xl:table-cell">
                      {value(player.pointsPerSubmission)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono xl:table-cell">
                      {value(player.pointsPerEligibleVoter)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-lime-200">
                      {value(player.averageRoundIndex)}×
                    </TableCell>
                    <TableCell className="hidden text-right font-mono 2xl:table-cell">
                      {player.averageRoundPercentile === null
                        ? "—"
                        : `${player.averageRoundPercentile.toFixed(0)}th`}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {player.roundWins}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono lg:table-cell">
                      {player.topQuartileRate === null
                        ? "—"
                        : `${(player.topQuartileRate * 100).toFixed(0)}%`}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
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
            entered rounds (default three). Provisional is a sample-size label,
            not a quality judgment. Round wins include ties; top-quartile rate
            uses each round&apos;s local point percentile.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
