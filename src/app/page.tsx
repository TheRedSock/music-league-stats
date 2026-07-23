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
import { Suspense } from "react";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import {
  AnalyticsEmpty,
  AnalyticsUnavailable,
} from "@/components/analytics/analytics-state";
import { LeaderboardPanel } from "@/components/analytics/leaderboard-panel";
import { PointDistributionChart } from "@/components/analytics/point-distribution-chart";
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
  encodeScopeIds,
  getCachedDashboardAlignmentData,
  getCachedDashboardData,
  getCachedFilterOptions,
  loadAnalytics,
  leagueTableLabel,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  scopeQueryParams,
  truncateRoundName,
  type SearchParams,
} from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

const summaryMetadata = [
  { key: "leagues", label: "Leagues", icon: Layers3 },
  { key: "rounds", label: "Imported rounds", icon: BarChart3 },
  { key: "players", label: "Players", icon: UsersRound },
  { key: "songs", label: "Songs", icon: Music2 },
  { key: "points", label: "Eligible points", icon: Sparkles },
] as const;

function AlignmentPanel({
  alignments,
  filterParams,
}: {
  alignments: Awaited<ReturnType<typeof getCachedDashboardAlignmentData>>;
  filterParams: ReturnType<typeof scopeQueryParams>;
}) {
  return (
    <Card className="overflow-hidden border-violet-300/15 bg-gradient-to-br from-violet-400/[0.07] to-lime-300/[0.025]">
      <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
          <Gauge aria-hidden="true" className="size-6" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
            Vote-pattern alignment
          </p>
          {alignments.length ? (
            <>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Top aligned ballot patterns
              </h2>
              <ol className="mt-4 grid gap-3 lg:grid-cols-3">
                {alignments.map((alignment, index) => (
                  <li
                    className="rounded-2xl border border-white/[0.08] bg-black/15 p-4"
                    key={`${alignment.leftId}-${alignment.rightId}`}
                  >
                    <p className="font-mono text-xs text-zinc-600">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-2 truncate text-sm font-semibold text-white">
                      <Link
                        className="hover:text-lime-200"
                        href={buildAnalyticsHref(
                          `/players/${alignment.leftId}`,
                          filterParams,
                          {},
                        )}
                      >
                        {alignment.leftName}
                      </Link>{" "}
                      &amp;{" "}
                      <Link
                        className="hover:text-lime-200"
                        href={buildAnalyticsHref(
                          `/players/${alignment.rightId}`,
                          filterParams,
                          {},
                        )}
                      >
                        {alignment.rightName}
                      </Link>
                    </h3>
                    <p className="mt-2 font-mono text-2xl text-violet-100">
                      {(alignment.alignment * 100).toFixed(0)}%
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {alignment.comparableFeatures} features ·{" "}
                      {alignment.sharedRounds}/{alignment.scopeRounds} rounds
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400">
                Budget-normalized point-vector alignment describes vote
                patterns, not personal relationships or causality.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-xl font-semibold text-white">
                More shared ratings needed
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Alignment appears after two voters have enough comparable ballot
                features and shared voted rounds in at least half of the
                selected scope.
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
  );
}

function AlignmentFallback() {
  return (
    <Card className="overflow-hidden border-violet-300/15 bg-gradient-to-br from-violet-400/[0.07] to-lime-300/[0.025]">
      <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <span className="grid size-12 animate-pulse place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
          <Gauge aria-hidden="true" className="size-6" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
            Vote-pattern alignment
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Calculating alignment
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Comparing scoped ballot patterns separately from the main dashboard.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

async function DashboardAlignmentCard({
  filter,
  filterParams,
}: {
  filter: { leagueIds: string[]; roundIds: string[] };
  filterParams: ReturnType<typeof scopeQueryParams>;
}) {
  const result = await loadAnalytics(() =>
    getCachedDashboardAlignmentData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
    ),
  );
  return (
    <AlignmentPanel
      alignments={result.status === "ready" ? result.data : []}
      filterParams={filterParams}
    />
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedDashboardData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
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
  const filterParams = scopeQueryParams(filter);
  const summaryCards = filter.leagueIds.length
    ? summaryMetadata.filter(({ key }) => key !== "leagues")
    : summaryMetadata;

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
        <div className="w-full lg:max-w-5xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <div className="mt-9 space-y-8 sm:space-y-10">
        <section aria-labelledby="summary-heading">
          <h2 className="sr-only" id="summary-heading">
            Scope summary
          </h2>
          <div
            className={
              summaryCards.length === 5
                ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            }
          >
            {summaryCards.map(({ icon: Icon, key, label }) => (
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
                      Support index compares the song&apos;s points with the
                      points expected from the eligible ballot budgets that
                      could reach it. 1.0 is expected support.
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
                            )}{" "}
                            <span className="font-normal text-zinc-500">
                              - {song.artist}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            <MusicLeagueLink
                              href={musicLeagueUrl(
                                song.leagueMusicLeagueId,
                                song.sourceRoundId,
                              )}
                            >
                              {leagueTableLabel({
                                name: song.leagueName,
                                slug: song.leagueSlug,
                              })}{" "}
                              · R{song.roundOrdinal} ·{" "}
                              {truncateRoundName(song.roundName)}
                            </MusicLeagueLink>
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
                  <PointDistributionChart buckets={data.pointDistribution} />
                </CardContent>
              </Card>
            </section>

            <Suspense fallback={<AlignmentFallback />}>
              <DashboardAlignmentCard
                filter={filter}
                filterParams={filterParams}
              />
            </Suspense>
          </>
        )}
      </div>
    </Container>
  );
}
