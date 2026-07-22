import {
  BarChart3,
  Gauge,
  Layers3,
  Music2,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { LeaderboardPanel } from "@/components/analytics/leaderboard-panel";
import { Container } from "@/components/layout/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildAnalyticsHref,
  getDashboardData,
  getFilterOptions,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  type SearchParams,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const summaryMetadata = [
  { key: "leagues", label: "Leagues", icon: Layers3 },
  { key: "rounds", label: "Imported rounds", icon: BarChart3 },
  { key: "players", label: "Players", icon: UsersRound },
  { key: "songs", label: "Songs", icon: Music2 },
  { key: "points", label: "Eligible points", icon: Sparkles },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const result = await loadAnalytics(async () => {
    const options = await getFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getDashboardData(filter);
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
  const filterParams = {
    league: filter.leagueId,
    round: filter.roundId,
  };
  const distributionMaximum = Math.max(
    1,
    ...data.pointDistribution.map(({ count }) => count),
  );

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {selectedFilterLabel(options, filter)}
          </p>
        </div>
        <div className="w-full lg:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <div className="mt-9 space-y-8 sm:space-y-10">
        <section aria-labelledby="summary-heading">
          <h2 className="sr-only" id="summary-heading">
            Scope summary
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryMetadata.map(({ icon: Icon, key, label }) => (
              <Card className="overflow-hidden" key={key}>
                <CardContent className="relative p-5">
                  <Icon
                    aria-hidden="true"
                    className="absolute right-4 top-4 size-5 text-zinc-700"
                  />
                  <p className="font-mono text-2xl font-semibold text-white">
                    {data.summary[key].toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {data.summary.songs === 0 ? (
          <AnalyticsEmpty
            description={
              options.leagues.length
                ? "This scope has no imported submissions and votes yet. Choose another league or round, or import a complete export."
                : "Create a league and import its four Music League CSV exports to populate public analytics."
            }
          />
        ) : (
          <>
            <Card>
              <CardContent className="p-5 sm:p-7">
                <LeaderboardPanel rows={data.leaderboard} />
              </CardContent>
            </Card>

            <section
              aria-labelledby="songs-heading"
              className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]"
            >
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle id="songs-heading">
                      Top round-adjusted songs
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Support index compares a song&apos;s share of eligible
                      round points with an equal share of that round&apos;s
                      slate. 1.0 is round average.
                    </CardDescription>
                  </div>
                  <Link
                    className="shrink-0 text-xs font-medium text-lime-300 hover:text-lime-200"
                    href={buildAnalyticsHref("/songs", filterParams, {
                      sort: "normalized-index",
                    })}
                  >
                    View all
                  </Link>
                </CardHeader>
                <CardContent>
                  <ol className="divide-y divide-white/[0.06]">
                    {data.topSongs.map((song, index) => (
                      <li
                        className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3.5"
                        key={song.id}
                      >
                        <span className="font-mono text-xs text-zinc-600">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {song.spotifyUrl ? (
                              <a
                                className="hover:text-lime-200"
                                href={song.spotifyUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {song.title}
                              </a>
                            ) : (
                              song.title
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {song.artist} · {song.leagueName}, R
                            {song.roundOrdinal}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm text-white">
                            {song.supportIndex?.toFixed(2) ?? "—"}×
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {song.points} pts
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Eligible vote points</CardTitle>
                  <CardDescription>
                    Active voters create eligible opportunities for every
                    visible song they did not submit. Omitted opportunities are
                    counted as zero.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    aria-label={data.pointDistribution
                      .map(({ count, label }) => `${label}: ${count}`)
                      .join(", ")}
                    className="grid h-52 grid-cols-7 items-end gap-2"
                    role="img"
                  >
                    {data.pointDistribution.map((bucket) => (
                      <div className="text-center" key={bucket.label}>
                        <div className="flex h-36 items-end rounded-lg bg-white/[0.035]">
                          <div
                            aria-hidden="true"
                            className="w-full rounded-t-md bg-gradient-to-t from-violet-500/70 to-lime-300/80"
                            style={{
                              height: `${Math.max(
                                bucket.count ? 3 : 0,
                                (bucket.count / distributionMaximum) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 font-mono text-xs text-zinc-300">
                          {bucket.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">
                          {bucket.count}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card className="overflow-hidden border-violet-300/15 bg-gradient-to-br from-violet-400/[0.07] to-lime-300/[0.025]">
              <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                <span className="grid size-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
                  <Gauge aria-hidden="true" className="size-6" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
                    Vote-pattern alignment
                  </p>
                  {data.alignment ? (
                    <>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {data.alignment.leftName} &amp;{" "}
                        {data.alignment.rightName}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                        Their budget-normalized point vectors have{" "}
                        {(data.alignment.alignment * 100).toFixed(0)}%
                        alignment across {data.alignment.comparableFeatures}{" "}
                        comparable features in {data.alignment.sharedRounds}/
                        {data.alignment.scopeRounds} rounds. This describes
                        vote patterns, not personal relationships or causality.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        More shared ratings needed
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        Alignment appears after two voters have enough
                        comparable selected-scope ballot features and shared
                        voted rounds.
                      </p>
                    </>
                  )}
                </div>
                <Trophy
                  aria-hidden="true"
                  className="hidden size-10 text-lime-300/60 lg:block"
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Container>
  );
}
