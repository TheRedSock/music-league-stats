import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Gauge,
  Medal,
  Network,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
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
  getFilterOptions,
  getPlayerProfileData,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  selectedFilterLabel,
  type DirectionalRelationship,
  type SearchParams,
  type SongAnalyticsRow,
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Player profile",
};

export const dynamic = "force-dynamic";

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function relationshipExtremes(
  relationships: DirectionalRelationship[],
  direction: "received" | "given",
) {
  const all = relationships.filter((row) => row.direction === direction);
  const sampled = all.filter(
    (row) => row.encounters >= 10 && row.sharedRounds >= 3,
  );
  return {
    most: [...sampled]
      .sort((a, b) => b.pointsPerEncounter - a.pointsPerEncounter)
      .slice(0, 3),
    least: [...sampled]
      .sort((a, b) => a.pointsPerEncounter - b.pointsPerEncounter)
      .slice(0, 3),
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
                {song.artist} · {song.leagueName}, R{song.roundOrdinal}
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

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await loadAnalytics(async () => {
    const options = await getFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(query), options);
    const profile = await getPlayerProfileData(id, filter);
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
  const filterParams = {
    league: filter.leagueId,
    round: filter.roundId,
  };
  const high = profile.submissions.slice(0, 3);
  const low = [...profile.submissions].reverse().slice(0, 3);
  const received = relationshipExtremes(profile.relationships, "received");
  const given = relationshipExtremes(profile.relationships, "given");
  const alignmentSplit = Math.ceil(profile.alignments.length / 2);
  const highestAlignments = profile.alignments
    .slice(0, Math.min(4, alignmentSplit));
  const lowestAlignments = profile.alignments
    .slice(Math.max(alignmentSplit, profile.alignments.length - 4))
    .reverse();
  const averageTiming = profile.timing.length
    ? profile.timing.reduce((sum, row) => sum + row.relativeOrder, 0) /
      profile.timing.length
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
        <div className="w-full lg:max-w-xl">
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
            Explicit exported vote rows only. Toggle each view between counts
            and its own distribution ratio; missing ballots are not zeros.
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
            description: `Who gave ${player.name}'s songs more or fewer points per recorded encounter.`,
            groups: received,
          },
          {
            direction: "given" as const,
            title: "Points given by recipient",
            description: `Whose songs ${player.name} gave more or fewer points per recorded encounter.`,
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
                            {row.encounters} encounters ·{" "}
                            {row.sharedRounds} rounds ·{" "}
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
                  No comparison reaches 10 recorded encounters across three
                  rounds in this scope.
                </p>
              ) : (
                <p className="text-xs leading-5 text-zinc-600 sm:col-span-2">
                  The displayed rate is points per recorded encounter.
                  Comparisons require at least 10 encounters across three
                  rounds so very small samples do not lead the ratio ranking.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Gauge aria-hidden="true" className="mb-2 size-5 text-lime-300" />
            <CardTitle>Vote-pattern alignment</CardTitle>
            <CardDescription>
              Cosine alignment on songs both voters rated, excluding songs
              submitted by either person. Shown only at 20 common songs across
              at least three rounds.
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
                              {alignment.commonSongs} songs ·{" "}
                              {alignment.sharedRounds} rounds
                            </p>
                          </div>
                          <p className="font-mono text-sm text-lime-200">
                            {alignment.alignment.toFixed(2)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-zinc-500">
                No comparison reaches the minimum shared sample in this scope.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              Alignment describes exported point patterns. It does not infer
              friendship, listening behavior, or causality.
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
            {averageTiming !== null ? (
              <>
                <div className="mb-5">
                  <p className="font-mono text-3xl font-semibold text-white">
                    {(averageTiming * 100).toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Average relative order position
                  </p>
                </div>
                <ol className="divide-y divide-white/[0.06]">
                  {profile.timing.slice(0, 8).map((row) => (
                    <li
                      className="grid grid-cols-[1fr_auto] gap-4 py-3"
                      key={row.roundId}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200">
                          {row.leagueName} · R{row.ordinal} {row.roundName}
                        </p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            aria-hidden="true"
                            className="h-full rounded-full bg-violet-300"
                            style={{ width: `${row.relativeOrder * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-violet-200">
                          {(row.relativeOrder * 100).toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-zinc-600">
                          {row.observedVoters} voters
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                No exported ballot timestamps in this scope.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              A lower position means the recorded ballot completion preceded
              more observed ballots. It says nothing about a deadline or why a
              voter submitted at that time.
            </p>
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
