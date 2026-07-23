import { ExternalLink, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsUnavailable } from "@/components/analytics/analytics-state";
import { Container } from "@/components/layout/container";
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
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedSubmissionFactsData,
  leagueTableLabel,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  scopeQueryParams,
  spotifyTrackUrl,
  truncateRoundName,
  type SearchParams,
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Facts",
  description: "Scope-aware submission facts and repeat patterns.",
};

function FactList({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function rankedList<T>({
  rows,
  render,
}: {
  rows: T[];
  render: (row: T, index: number) => ReactNode;
}) {
  return (
    <ol className="divide-y divide-white/[0.06]">
      {rows.map((row, index) => (
        <li className="grid grid-cols-[2rem_1fr] gap-3 py-3" key={index}>
          <span className="font-mono text-xs text-zinc-600">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">{render(row, index)}</div>
        </li>
      ))}
    </ol>
  );
}

export default async function FactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedSubmissionFactsData(
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

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Facts
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Submission patterns in the selected scope
          </p>
        </div>
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <section className="mt-9 grid gap-4 lg:grid-cols-3">
        <FactList
          description="Artists grouped by exact exported artist text, normalized for case."
          title="Most-submitted artists"
        >
          {rankedList({
            rows: data.mostSubmittedArtists,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.artist}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions · {row.submitters} submitters
                </p>
              </>
            ),
          })}
        </FactList>

        <FactList
          description="The strongest one-player, one-artist repeats."
          title="Player artist streaks"
        >
          {rankedList({
            rows: data.artistLoyalists,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <Link
                    className="hover:text-lime-200"
                    href={buildAnalyticsHref(
                      `/players/${row.playerId}`,
                      filterParams,
                      {},
                    )}
                  >
                    {row.playerName}
                  </Link>{" "}
                  <span className="text-zinc-500">→ {row.artist}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions
                </p>
              </>
            ),
          })}
        </FactList>

        <FactList
          description="Artists that reached the most different submitters."
          title="Broadest artist reach"
        >
          {rankedList({
            rows: data.diverseArtists,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.artist}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submitters} submitters · {row.submissions} submissions
                </p>
              </>
            ),
          })}
        </FactList>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactList
          description="Players with the most submissions and distinct artists in this scope."
          title="Most prolific submitters"
        >
          {rankedList({
            rows: data.prolificSubmitters,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <Link
                    className="hover:text-lime-200"
                    href={buildAnalyticsHref(
                      `/players/${row.playerId}`,
                      filterParams,
                      {},
                    )}
                  >
                    {row.playerName}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions · {row.artists} artists
                </p>
              </>
            ),
          })}
        </FactList>

        <FactList
          description="Rounds with the largest submitted song slates."
          title="Densest rounds"
        >
          {rankedList({
            rows: data.densestRounds,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  R{row.roundOrdinal} · {truncateRoundName(row.roundName)} ·{" "}
                  {row.submissions} songs from {row.submitters} submitters
                </p>
              </>
            ),
          })}
        </FactList>
      </section>

      <Card className="mt-4">
        <CardHeader>
          <Sparkles aria-hidden="true" className="mb-2 size-5 text-lime-300" />
          <CardTitle>Repeated songs</CardTitle>
          <CardDescription>
            Tracks that were submitted more than once in the selected scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.repeatedSongs.length ? (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Song</TableHead>
                  <TableHead className="text-right">Submissions</TableHead>
                  <TableHead className="text-right">Submitters</TableHead>
                  <TableHead className="text-right">Leagues</TableHead>
                  <TableHead className="text-right">Rounds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.repeatedSongs.map((row) => {
                  const href = spotifyTrackUrl(row.spotifyUri);
                  return (
                    <TableRow key={row.spotifyUri}>
                      <TableCell className="max-w-0">
                        <p className="truncate font-medium text-zinc-100">
                          {href ? (
                            <a
                              className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
                              href={href}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="truncate">{row.title}</span>
                              <ExternalLink
                                aria-hidden="true"
                                className="size-3 shrink-0"
                              />
                            </a>
                          ) : (
                            <TruncatedCell title={row.title}>{row.title}</TruncatedCell>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {row.artist}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.submissions}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.submitters}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.leagues}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.rounds}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-zinc-500">
              No repeated tracks in this scope.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <FactList
          description="Same submitter, same Spotify track, more than once."
          title="Personal repeats"
        >
          {rankedList({
            rows: data.repeatSubmitterSongs,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <Link
                    className="hover:text-lime-200"
                    href={buildAnalyticsHref(
                      `/players/${row.playerId}`,
                      filterParams,
                      {},
                    )}
                  >
                    {row.playerName}
                  </Link>
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.title} · {row.artist} · {row.submissions}x
                </p>
              </>
            ),
          })}
        </FactList>

        <FactList description="Longest exported song titles." title="Longest titles">
          {rankedList({
            rows: data.longestTitles,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · {row.length} chars · {row.submitterName}
                </p>
              </>
            ),
          })}
        </FactList>

        <FactList description="Shortest exported song titles." title="Shortest titles">
          {rankedList({
            rows: data.shortestTitles,
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · {row.length} chars · {row.submitterName}
                </p>
              </>
            ),
          })}
        </FactList>
      </section>
    </Container>
  );
}
