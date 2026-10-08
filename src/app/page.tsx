import { Suspense } from "react";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import { formatPoints } from "@/lib/format";
import Link from "next/link";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { MusicLeagueScopeLinks } from "@/components/analytics/music-league-link";
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
  analyticsScopeKey,
  getCachedDashboardAlignmentData,
  getCachedDashboardData,
  getCachedFilterOptions,
  loadAnalytics,
  leagueTableLabel,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  scopeQueryParams,
  truncateRoundName,
  type SearchParams,
} from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

const summaryMetadata = [
  { key: "leagues", label: "leagues" }, { key: "rounds", label: "rounds" },
  { key: "players", label: "players" }, { key: "songs", label: "songs" },
  { key: "points", label: "points" },
] as const;

function AlignmentPanel({
  alignments,
  filterParams,
  pendingScopeMaterialization = false,
}: {
  alignments: Awaited<ReturnType<typeof getCachedDashboardAlignmentData>>;
  filterParams: ReturnType<typeof scopeQueryParams>;
  pendingScopeMaterialization?: boolean;
}) {
  return <section className="border-t border-white/10 pt-6" aria-labelledby="similarity-heading">
    <div className="flex items-baseline justify-between gap-4">
      <h2 id="similarity-heading" className="text-xl font-semibold">Most similar voting</h2>
      <Link className="text-sm text-lime-300" href={buildAnalyticsHref("/relationships", filterParams, { tab: "alignment" })}>Compare players →</Link>
    </div>
    {alignments.length ? <ol className="mt-4 grid gap-4 md:grid-cols-3">
      {alignments.map(alignment => <li key={`${alignment.leftId}-${alignment.rightId}`} className="border-l-2 border-lime-300/50 pl-4">
        <p className="text-sm font-medium">
          <Link className="hover:text-lime-200" href={buildAnalyticsHref(`/players/${alignment.leftId}`, filterParams, {})}>{alignment.leftName}</Link>
          {" & "}<Link className="hover:text-lime-200" href={buildAnalyticsHref(`/players/${alignment.rightId}`, filterParams, {})}>{alignment.rightName}</Link>
        </p>
        <p className="mt-2 text-2xl tabular-nums">{(alignment.alignment * 100).toFixed(0)}<span className="ml-1 text-xs text-zinc-400">/ 100 similarity</span></p>
        <p className="mt-1 text-xs text-zinc-400">{alignment.sharedRounds} shared rounds · {alignment.comparableFeatures} song comparisons</p>
      </li>)}
    </ol> : <p className="mt-3 text-sm text-zinc-400">{pendingScopeMaterialization ? "Open Compare to prepare results for these leagues." : "More shared votes are needed to compare these players."}</p>}
    <Link href="/faq#voting-similarity" className="mt-4 inline-block text-xs text-zinc-400 underline underline-offset-4">How similarity is measured</Link>
  </section>;
}

function AlignmentFallback() {
  return <p role="status" className="py-6 text-sm text-zinc-400">Loading voting similarity…</p>;
}

async function DashboardAlignmentCard({
  filter,
  filterParams,
}: {
  filter: { leagueIds: string[]; roundIds: string[] };
  filterParams: ReturnType<typeof scopeQueryParams>;
}) {
  const result = await loadAnalytics(async () => {
    const alignments = await getCachedDashboardAlignmentData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
    );
    let pendingScopeMaterialization = false;
    if (filter.leagueIds.length >= 2 && alignments.length === 0) {
      const { hasFreshScopeMaterialization } = await import(
        "@/lib/analytics-materialize"
      );
      pendingScopeMaterialization = !(await hasFreshScopeMaterialization(
        analyticsScopeKey(filter.leagueIds),
      ));
    }
    return { alignments, pendingScopeMaterialization };
  });
  return (
    <AlignmentPanel
      alignments={result.status === "ready" ? result.data.alignments : []}
      filterParams={filterParams}
      pendingScopeMaterialization={
        result.status === "ready"
          ? result.data.pendingScopeMaterialization
          : false
      }
    />
  );
}

async function HomePageContent({
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
        <AnalyticsUnavailable
          progressLabel={result.status === "building" ? result.progressLabel : null}
          status={result.status}
        />
      </Container>
    );
  }

  const { data, filter, options } = result.data;
  const filterParams = scopeQueryParams(filter);
  // Hide the leagues count only for a single-league scope (redundant with the title).
  const summaryCards =
    filter.leagueIds.length === 1
      ? summaryMetadata.filter(({ key }) => key !== "leagues")
      : summaryMetadata;

  return (
    <Container className="py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            The standings
          </h1>
        </div>
        <div className="min-w-0 sm:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <div className="mt-5 space-y-7 sm:space-y-10">
        <dl aria-label="League totals" className="flex flex-wrap gap-x-6 gap-y-2 border-y border-white/10 py-3 text-sm">
          {summaryCards.map(({ key, label }) => <div key={key} className="flex items-baseline gap-1.5">
            <dd className="font-semibold tabular-nums text-zinc-100">{data.summary[key].toLocaleString()}</dd>
            <dt className="text-zinc-400">{label}</dt>
          </div>)}
        </dl>

        {data.summary.songs === 0 ? (
          <AnalyticsEmpty
            description={
              options.leagues.length
                ? "This scope has no imported submissions and votes yet. Choose another league, or import a complete export."
                : "Create a league and import its four Music League CSV exports to populate public analytics."
            }
          />
        ) : (
          <>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <LeaderboardPanel
                  filterParams={filterParams}
                  rows={data.leaderboard}
                  scopeRounds={data.summary.rounds}
              totalRounds={options.rounds.length}
                />
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
                      Standout songs
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Ranked by adjusted support. <Link href="/faq#adjusted-support" className="underline underline-offset-4">About this measure</Link>
                    </CardDescription>
                  </div>
                  <Link
                    className="shrink-0 text-xs font-medium text-lime-300 hover:text-lime-200"
                    href={buildAnalyticsHref("/songs", filterParams, {
                      sort: "support-eb",
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
                          <p className="text-sm font-medium leading-5 text-zinc-100">
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
                            <span className="mt-1 block font-normal text-zinc-400">
                              {song.artist}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            <MusicLeagueScopeLinks
                              leagueHref={musicLeagueUrl(song.leagueMusicLeagueId)}
                              leagueLabel={leagueTableLabel({
                                name: song.leagueName,
                                slug: song.leagueSlug,
                              })}
                              leagueTitle={song.leagueName}
                              roundHref={musicLeagueUrl(
                                song.leagueMusicLeagueId,
                                song.sourceRoundId,
                              )}
                              roundLabel={
                                <>
                                  R{song.roundOrdinal} ·{" "}
                                  {truncateRoundName(song.roundName)}
                                </>
                              }
                              roundTitle={song.roundName}
                            />
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm text-white">
                            {song.supportIndexEb?.toFixed(2) ?? "—"}×
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {formatPoints(song.points)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Points per vote</CardTitle>
                  <CardDescription>
                    How often each score was given, including eligible zeroes.
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

export default function HomePage(props: { searchParams: Promise<SearchParams>; }) {
  return <Suspense fallback={<AnalyticsLoadingShell />}><HomePageContent {...props} /></Suspense>;
}
