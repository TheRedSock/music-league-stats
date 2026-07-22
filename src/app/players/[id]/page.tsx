import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Gauge,
  Info,
  Medal,
  Network,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import { AnalyticsUnavailable } from "@/components/analytics/analytics-state";
import { VoteDistributions } from "@/components/analytics/vote-distributions";
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
  buildAnalyticsHref,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedPlayerProfileData,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  scopeQueryParams,
  type DirectionalRelationship,
  type MutualRelationship,
  type SearchParams,
  type SongAnalyticsRow,
  type TimingRow,
} from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

export const metadata: Metadata = {
  title: "Player profile",
};

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function ordinal(value: number): string {
  const rounded = Math.round(value);
  const suffix =
    rounded % 100 >= 11 && rounded % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][rounded % 10] ?? "th";
  return `${rounded}${suffix}`;
}

function percentileLabel(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${ordinal(value * 100)} percentile`;
}

function relationshipExtremes(
  relationships: DirectionalRelationship[],
  direction: "received" | "given",
) {
  const sampled = relationships.filter((row) => row.direction === direction);
  return {
    most: [...sampled]
      .sort((a, b) => b.pointsPerEncounter - a.pointsPerEncounter)
      .slice(0, 5),
    least: [...sampled]
      .sort((a, b) => a.pointsPerEncounter - b.pointsPerEncounter)
      .slice(0, 5),
  };
}

function mutualExtremes(relationships: MutualRelationship[]) {
  return {
    mostPoints: [...relationships]
      .sort((a, b) => b.points - a.points)
      .slice(0, 5),
    leastPoints: [...relationships]
      .sort((a, b) => a.points - b.points)
      .slice(0, 5),
    highestShare: [...relationships]
      .sort((a, b) => b.ballotPointShare - a.ballotPointShare)
      .slice(0, 5),
    lowestShare: [...relationships]
      .sort((a, b) => a.ballotPointShare - b.ballotPointShare)
      .slice(0, 5),
  };
}

function SubmissionList({
  label,
  rows,
}: {
  label: string;
  rows: SongAnalyticsRow[];
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </h3>
      <ol className="mt-2 divide-y divide-white/[0.06]">
        {rows.map((song) => (
          <li className="flex items-center justify-between gap-4 py-3" key={song.id}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-100">
                {song.spotifyUrl ? (
                  <a
                    className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
                    href={song.spotifyUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="truncate">{song.title}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  song.title
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {song.artist} ·{" "}
                <MusicLeagueLink
                  href={musicLeagueUrl(
                    song.leagueMusicLeagueId,
                    song.sourceRoundId,
                  )}
                >
                  {song.leagueName}, R{song.roundOrdinal}
                </MusicLeagueLink>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm text-lime-200">
                {metric(song.supportIndex)}×
              </p>
              <p className="text-[11px] text-zinc-600">{song.points} pts</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TimingList({ label, rows }: { label: string; rows: TimingRow[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </h3>
      <ol className="mt-2 divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <li
            className="grid grid-cols-[1fr_auto] gap-4 py-3"
            key={row.roundId}
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">
                <MusicLeagueLink
                  href={musicLeagueUrl(
                    row.leagueMusicLeagueId,
                    row.sourceRoundId,
                  )}
                >
                  {row.leagueName} · R{row.ordinal} {row.roundName}
                </MusicLeagueLink>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  aria-hidden="true"
                  className="h-full rounded-full bg-violet-300"
                  style={{ width: `${row.relativeOrder! * 100}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-violet-200">
                {percentileLabel(row.relativeOrder)}
              </p>
              <p className="text-[10px] text-zinc-600">
                {row.ballotRank && row.tieCount
                  ? `${row.ballotRank}${row.tieCount > 1 ? `-${row.ballotRank + row.tieCount - 1}` : ""} of ${row.observedVoters}`
                  : `${row.observedVoters} voters`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(query), options);
    const profile = await getCachedPlayerProfileData(
      id,
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
    );
    return { filter, options, profile };
  });

  if (result.status !== "ready") {
    return (
      <Container className="py-16 sm:py-24">
        <AnalyticsUnavailable status={result.status} />
      </Container>
    );
  }
  if (!result.data.profile) notFound();

  const { filter, options, profile } = result.data;
  const { overview, player } = profile;
  const filterParams = scopeQueryParams(filter);
  const high = profile.submissions.slice(0, 5);
  const low = [...profile.submissions].reverse().slice(0, 5);
  const received = relationshipExtremes(profile.relationships, "received");
  const given = relationshipExtremes(profile.relationships, "given");
  const mutual = mutualExtremes(profile.mutualRelationships);
  const highestAlignments = profile.alignments.slice(0, 5);
  const lowestAlignments = profile.alignments.slice(-5).reverse();
  const votedTiming = profile.timing.filter((row) => row.relativeOrder !== null);
  const orderedTiming = [...votedTiming].sort(
    (left, right) => left.relativeOrder! - right.relativeOrder!,
  );
  const lowestTiming = orderedTiming.slice(0, 3);
  const highestTiming = orderedTiming.slice(-3).reverse();
  const missedBallots = profile.timing.filter(
    (row) => row.participation === "did_not_vote",
  ).length;
  const averageTiming = votedTiming.length
    ? votedTiming.reduce((sum, row) => sum + row.relativeOrder!, 0) /
      votedTiming.length
    : null;
  const overviewCards = [
    { label: "Exported points", value: overview?.totalPoints.toLocaleString() ?? "—" },
    { label: "Submissions", value: overview?.submissions.toLocaleString() ?? "—" },
    { label: "Entered rounds", value: overview?.enteredRounds.toLocaleString() ?? "—" },
    { label: "Points / song", value: metric(overview?.pointsPerSubmission) },
    { label: "Avg round index", value: `${metric(overview?.averageRoundIndex)}×` },
    {
      label: "Avg round percentile",
      value:
        overview?.averageRoundPercentile === null ||
        overview?.averageRoundPercentile === undefined
          ? "—"
          : `${overview.averageRoundPercentile.toFixed(0)}th`,
    },
  ];

  return (
    <Container className="py-10 sm:py-14">
      <Link
        className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}
        href={buildAnalyticsHref("/players", filterParams, {})}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All players
      </Link>

      <div className="mt-6 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant={overview?.provisional ? "muted" : "success"}>
            <UserRound aria-hidden="true" className="mr-1.5 size-3" />
            {overview?.provisional ? "Provisional sample" : "Player profile"}
          </Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
            {player.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Stable player identity combined across leagues, with every
            comparison normalized inside its original round.
          </p>
        </div>
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
          <p className="mt-2 text-right text-xs text-zinc-500">
            Showing {selectedFilterLabel(options, filter)}
          </p>
        </div>
      </div>

      {overview ? (
        <section aria-labelledby="overview-heading" className="mt-9">
          <h2 className="sr-only" id="overview-heading">
            Overview
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {overviewCards.map((card) => (
              <Card key={card.label}>
                <CardContent className="p-5">
                  <p className="font-mono text-xl font-semibold text-white">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{card.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card className="mt-9 border-dashed">
          <CardHeader>
            <CardTitle>No submissions in this scope</CardTitle>
            <CardDescription>
              The player exists, but has no submitted songs under the selected
              league and round filters. Voting activity may still appear below.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {profile.submissions.length ? (
        <Card className="mt-6">
          <CardHeader>
            <Medal aria-hidden="true" className="mb-2 size-5 text-lime-300" />
            <CardTitle>Submission range</CardTitle>
            <CardDescription>
              Highest and lowest are ordered by round-local support index, not
              an objective judgment of the songs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-8 lg:grid-cols-2">
            <SubmissionList label="Highest round performance" rows={high} />
            <SubmissionList label="Lowest round performance" rows={low} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Point distributions</CardTitle>
          <CardDescription>
            Active ballots include inferred zeroes for omitted eligible songs.
            Bars and ratios are weighted by represented points; vote counts are
            shown as supporting context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoteDistributions
            given={profile.givenDistribution}
            received={profile.receivedDistribution}
          />
        </CardContent>
      </Card>

      <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="Directional relationships">
        {[
          {
            direction: "received" as const,
            title: "Points received by voter",
            description: `Who gave ${player.name}'s songs more or fewer points per eligible opportunity.`,
            groups: received,
          },
          {
            direction: "given" as const,
            title: "Points given by recipient",
            description: `Whose songs ${player.name} gave more or fewer points per eligible opportunity.`,
            groups: given,
          },
        ].map(({ description, direction, groups, title }) => (
          <Card key={direction}>
            <CardHeader>
              <Network aria-hidden="true" className="mb-2 size-5 text-violet-300" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-7 sm:grid-cols-2">
              {[
                ["Higher rate", groups.most],
                ["Lower rate", groups.least],
              ].map(([label, rows]) => (
                <div key={label as string}>
                  <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
                    {label as string}
                  </h3>
                  <ol className="mt-2 divide-y divide-white/[0.06]">
                    {(rows as DirectionalRelationship[]).map((row) => (
                      <li
                        className="flex items-center justify-between gap-3 py-3"
                        key={row.competitorId}
                      >
                        <div className="min-w-0">
                          <Link
                            className="truncate text-sm font-medium text-zinc-100 hover:text-lime-200"
                            href={buildAnalyticsHref(
                              `/players/${row.competitorId}`,
                              filterParams,
                              {},
                            )}
                          >
                            {row.competitorName}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-zinc-600">
                            {row.encounters} opportunities ·{" "}
                            {row.sharedRounds}/{row.scopeRounds} rounds ·{" "}
                            {(row.positiveRate * 100).toFixed(0)}% positive
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-sm text-lime-200">
                          {row.pointsPerEncounter.toFixed(2)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {!groups.most.length ? (
                <p className="text-sm leading-6 text-zinc-500 sm:col-span-2">
                  No comparison has eligible opportunities in at least half of
                  the selected rounds.
                </p>
              ) : (
                <p className="text-xs leading-5 text-zinc-600 sm:col-span-2">
                  The displayed rate is points per eligible opportunity,
                  including inferred zeroes. Comparisons must cover at least
                  half of the selected rounds; the required sample therefore
                  scales down for league and round filters.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-6">
        <CardHeader>
          <Network aria-hidden="true" className="mb-2 size-5 text-lime-300" />
          <CardTitle>Mutual voting support</CardTitle>
          <CardDescription>
            Combined points between {player.name} and another player in both
            directions, shown both as totals and as the share of eligible ballot
            points allocated to each other. Comparisons must cover at least half
            of the selected scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-7 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Most combined points",
              rows: mutual.mostPoints,
              value: (row: MutualRelationship) => `${row.points} pts`,
            },
            {
              label: "Fewest combined points",
              rows: mutual.leastPoints,
              value: (row: MutualRelationship) => `${row.points} pts`,
            },
            {
              label: "Highest ballot share",
              rows: mutual.highestShare,
              value: (row: MutualRelationship) =>
                `${(row.ballotPointShare * 100).toFixed(1)}%`,
            },
            {
              label: "Lowest ballot share",
              rows: mutual.lowestShare,
              value: (row: MutualRelationship) =>
                `${(row.ballotPointShare * 100).toFixed(1)}%`,
            },
          ].map(({ label, rows, value }) => (
            <div key={label}>
              <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
                {label}
              </h3>
              <ol className="mt-2 divide-y divide-white/[0.06]">
                {rows.map((row) => (
                  <li
                    className="flex items-center justify-between gap-3 py-3"
                    key={row.competitorId}
                  >
                    <div className="min-w-0">
                      <Link
                        className="truncate text-sm font-medium text-zinc-100 hover:text-lime-200"
                        href={buildAnalyticsHref(
                          `/players/${row.competitorId}`,
                          filterParams,
                          {},
                        )}
                      >
                        {row.competitorName}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {row.pointsPerOpportunity.toFixed(2)} pts/opportunity ·{" "}
                        {(row.positiveRate * 100).toFixed(0)}% positive ·{" "}
                        {row.sharedRounds}/{row.scopeRounds} rounds
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm text-lime-200">
                      {value(row)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {!mutual.mostPoints.length ? (
            <p className="text-sm leading-6 text-zinc-500 sm:col-span-2 xl:col-span-4">
              No mutual comparison has eligible opportunities in at least half
              of the selected rounds.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Gauge aria-hidden="true" className="mb-2 size-5 text-lime-300" />
            <div className="flex items-center gap-2">
              <CardTitle>Vote-pattern alignment</CardTitle>
              <details className="group relative">
                <summary className="inline-flex cursor-help list-none rounded-sm text-zinc-500 outline-none hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-lime-300/40">
                  <Info aria-hidden="true" className="size-4" />
                  <span className="sr-only">Show alignment formula details</span>
                </summary>
                <p className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-white/10 bg-zinc-950 p-3 text-xs font-normal leading-5 text-zinc-300 shadow-2xl">
                  Compares inferred-zero full-ballot vectors only in the
                  selected scope. Each ballot is normalized by its eligible
                  point total. Songs submitted by either player become one
                  mutual-support bucket when both directions exist, avoiding
                  extra weight from submitting multiple songs.
                </p>
              </details>
            </div>
            <CardDescription>
              Budget-normalized cosine alignment on comparable selected-scope
              ballot features. Shown only after the pair meets sample and
              coverage thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profile.alignments.length ? (
              <div className="grid gap-7 sm:grid-cols-2">
                {[
                  ["Highest alignment", highestAlignments],
                  ["Lowest alignment", lowestAlignments],
                ].map(([label, rows]) => (
                  <div key={label as string}>
                    <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
                      {label as string}
                    </h3>
                    <ol className="mt-2 divide-y divide-white/[0.06]">
                      {(rows as typeof profile.alignments).map((alignment) => (
                        <li
                          className="flex items-center justify-between gap-4 py-3"
                          key={alignment.competitorId}
                        >
                          <div>
                            <Link
                              className="text-sm font-medium text-zinc-100 hover:text-lime-200"
                              href={buildAnalyticsHref(
                                `/players/${alignment.competitorId}`,
                                filterParams,
                                {},
                              )}
                            >
                              {alignment.competitorName}
                            </Link>
                            <p className="mt-0.5 text-[11px] text-zinc-600">
                              {alignment.comparableFeatures} features ·{" "}
                              {alignment.sharedRounds}/{alignment.scopeRounds} rounds
                            </p>
                          </div>
                          <p className="font-mono text-sm text-lime-200">
                            {(alignment.alignment * 100).toFixed(0)}%
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-zinc-500">
                No comparison has enough features and shared voted rounds
                across at least half of the selected scope.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              Alignment describes selected-scope vote patterns, including
              inferred zeroes for active ballots. It does not infer friendship,
              listening behavior, or causality.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Clock3 aria-hidden="true" className="mb-2 size-5 text-violet-300" />
            <CardTitle>Relative voting order</CardTitle>
            <CardDescription>
              One ballot timestamp per voter and round (the latest exported
              cast time), ranked among observed voters in that same round.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {votedTiming.length ? (
              <>
                <div className="mb-5">
                  <p className="font-mono text-3xl font-semibold text-white">
                    {percentileLabel(averageTiming)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Average relative voting order
                  </p>
                </div>
                <div className="grid gap-7 sm:grid-cols-2">
                  <TimingList
                    label="Highest percentiles"
                    rows={highestTiming}
                  />
                  <TimingList label="Lowest percentiles" rows={lowestTiming} />
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                No recorded ballot timing in this scope.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              A lower percentile means the recorded ballot completion preceded
              more observed ballots. Percentiles use a midpoint rank within the
              round, so tied earliest ballots no longer display as 0th
              percentile. The lists show the three highest and three lowest
              recorded percentiles.
              {missedBallots
                ? ` ${missedBallots} submitted ${missedBallots === 1 ? "round has" : "rounds have"} no exported ballot and ${missedBallots === 1 ? "is" : "are"} excluded.`
                : ""}
            </p>
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
