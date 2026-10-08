import { Suspense } from "react";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import { qualificationRoundFloor } from "@/lib/participation";
import Form from "next/form";
import { buttonStyles } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsUnavailable } from "@/components/analytics/analytics-state";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
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
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  defaultRelationshipSortDirection,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedPlayersData,
  parsePositiveInteger,
  getCachedRelationshipsTableData,
  getRelationshipsTableData,
  loadAnalytics,
  parseAnalyticsFilters,
  parseFocusPlayerId,
  parseRelationshipSort,
  parseRelationshipSortDirection,
  parseRelationshipTab,
  resolveAnalyticsFilter,
  scopeQueryParams,
  type QueryValue,
  type RelationshipTab,
  type RelationshipTableRow,
  type SearchParams,
} from "@/lib/analytics";

export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Compare",
  description: "Full scope-aware player relationship comparison tables.",
};

const tabs: Array<{ tab: RelationshipTab; label: string; description: string }> = [
  {
    tab: "given",
    label: "Support",
    description: "Points from one player to another. Each direction has its own row.",
  },
  {
    tab: "mutual",
    label: "Mutual",
    description: "Combined support between two players in both directions.",
  },
  {
    tab: "alignment",
    label: "Voting similarity",
    description: "How similarly two players scored the same songs.",
  },
  {
    tab: "timing",
    label: "Timing",
    description: "Who tends to vote early or late within a round.",
  },
];

function percent(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function valueFor(tab: RelationshipTab, row: RelationshipTableRow): string {
  if (tab === "alignment") return row.alignment == null ? "—" : `${(row.alignment * 100).toFixed(0)} / 100`;
  if (tab === "timing") return percent(row.averageTiming);
  if (tab === "mutual") return percent(row.ballotPointShare, 1);
  return metric(row.pointsPerOpportunity);
}

async function RelationshipsPageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedTab = parseRelationshipTab(params.tab);
  const tab = requestedTab === "received" ? "given" : requestedTab;
  const sort = parseRelationshipSort(params.sort, tab);
  const direction = parseRelationshipSortDirection(params.dir, sort);
  const focus = parseFocusPlayerId(params.focus);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);

    // Multi-league relationship caches are built as a side effect of applying
    // this page's scope filter — not via a dedicated public compute API.
    let scopeProgressLabel: string | null = null;
    let scopeError: string | null = null;
    let scopeReady = true;
    if (filter.leagueIds.length >= 2) {
      const { progressScopeMaterialization } = await import(
        "@/lib/analytics-materialize"
      );
      const scopeStatus = await progressScopeMaterialization(filter.leagueIds);
      if (scopeStatus.status === "deferred") {
        scopeError = scopeStatus.message;
        scopeReady = false;
      } else if (scopeStatus.status === "failed") {
        scopeError =
          scopeStatus.job?.errorMessage ?? "Scope materialization failed.";
        scopeReady = false;
      } else if (scopeStatus.status !== "completed") {
        scopeReady = false;
        const progress = scopeStatus.progress;
        scopeProgressLabel = progress
          ? `${progress.stepLabel} (${progress.stepIndex + 1}/${progress.stepCount})…`
          : "Preparing league combination…";
      }
    }

    if (!scopeReady && tab !== "timing") {
      return {
        data: null,
        filter,
        options,
        scopeError,
        scopeProgressLabel,
      };
    }

    const data = await getCachedRelationshipsTableData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
      tab,
      sort,
      direction,
      focus,
    );
    if (data.needsScopeMaterialization && filter.leagueIds.length >= 2) {
      return {
        data: await getRelationshipsTableData(filter, {
          direction,
          focusPlayerId: focus,
          sort,
          tab,
        }),
        filter,
        options,
        scopeError: null,
        scopeProgressLabel: null,
      };
    }
    return { data, filter, options, scopeError: null, scopeProgressLabel: null };
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

  const { data, filter, options, scopeError, scopeProgressLabel } = result.data;
  if (!data) {
    const { ScopeMaterializationSplash } = await import(
      "@/components/analytics/analytics-building"
    );
    return (
      <Container className="py-6 sm:py-10">
        <div className="mb-8">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
        <ScopeMaterializationSplash
          errorMessage={scopeError}
          progressLabel={scopeProgressLabel}
        />
      </Container>
    );
  }

  const playerOptions = await getCachedPlayersData(encodeScopeIds(filter.leagueIds), encodeScopeIds(filter.roundIds), "", "name", "asc");
  const playerSlugs = new Map(playerOptions.rows.map(player => [player.id, player.slug]));
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(data.rows.length / pageSize));
  const page = Math.min(parsePositiveInteger(params.page, 1, 100000), pageCount);
  const visibleRows = data.rows.slice((page - 1) * pageSize, page * pageSize);
  const currentParams: Record<string, QueryValue> = {
    ...scopeQueryParams(filter),
    dir: direction,
    focus: data.focusPlayer?.id ?? null,
    sort,
    tab,
  };
  const activeTab = tabs.find((item) => item.tab === tab)!;
  const scopeRounds = options.rounds.filter(round =>
    (!filter.leagueIds.length || filter.leagueIds.includes(round.leagueId)) &&
    (!filter.roundIds.length || filter.roundIds.includes(round.id)),
  ).length;
  const minimumRounds = qualificationRoundFloor(scopeRounds, options.rounds.length);
  const valueLabel = tab === "alignment" ? "Similarity" : tab === "timing" ? "Ballot position" : tab === "mutual" ? "Ballot share" : "Pts / opportunity";
  const sampleLabel = tab === "alignment" ? "Song comparisons" : tab === "timing" ? "Ballots cast" : "Opportunities";
  const contextLabel = tab === "timing" ? "Missed ballots" : tab === "alignment" ? "Scope covered" : "Awarded ≥1 pt";
  const contextHelp = tab === "timing" ? "Entered rounds where the player did not cast a ballot." : tab === "alignment" ? "Shared voted rounds with variation in both voters' scores on shared songs, divided by all rounds in the selected scope." : "Percentage and count of eligible song-voter opportunities awarded at least one point; the rest received zero points. Mutual support combines both directions.";

  return (
    <Container className="py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Compare
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {data.focusPlayer
              ? `Focused on ${data.focusPlayer.name}`
              : "All qualifying player comparisons"}
          </p>
        </div>
        <div className="min-w-0 sm:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex flex-col gap-4 space-y-0 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
          <CardTitle>{activeTab.label} comparisons</CardTitle>
          <CardDescription>{activeTab.description}</CardDescription>
          <p className="text-xs text-zinc-400">{tab === "timing" ? "Lower means earlier voting." : `Based on at least ${minimumRounds} shared rounds.`} <Link href={`/faq#${tab === "alignment" ? "voting-similarity" : tab === "timing" ? "timing" : "support"}`} className="underline underline-offset-4">About these measures</Link></p>
          </div>
          <Form action="/relationships" className="flex min-w-0 flex-wrap items-end gap-2 lg:w-96 lg:shrink-0">
            {filter.leagueIds.map(id => <input type="hidden" key={id} name="league" value={id} />)}
            <input type="hidden" name="tab" value={tab} /><input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={direction} />
            <label className="min-w-0 flex-1"><span className="mb-1 block text-xs text-zinc-400">Focus on a player</span>
              <select name="focus" defaultValue={focus ?? ""} className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm">
                <option value="">All players</option>
                {playerOptions.rows.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonStyles({variant:"secondary"})}>Compare</button>
          </Form>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((item) => (
              <Link
                className={
                  item.tab === tab
                    ? "rounded-md border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-xs font-medium text-lime-100"
                    : "rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-white"
                }
                href={buildAnalyticsHref("/relationships", currentParams, {
                  dir: defaultRelationshipSortDirection(
                    parseRelationshipSort(undefined, item.tab),
                  ),
                  page: null,
                  sort: parseRelationshipSort(undefined, item.tab),
                  tab: item.tab,
                })}
                key={item.tab}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {data.rows.length ? (
            <div className="mt-5">
              <Table className="min-w-[850px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      className="w-[30%]"
                      defaultDirection="asc"
                      params={currentParams}
                      path="/relationships"
                      title={tab === "given" ? "The player on the left gives points to the player on the right." : "The player or pair being compared; click either name to open their profile."}
                      sortKey="player"
                    >
                      {tab === "given" ? "Giver → receiver" : tab === "timing" ? "Player" : "Player pair"}
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[14%]"
                      title={tab === "alignment" ? "Agreement on shared songs: −100 means opposing choices, +100 means similar choices." : tab === "timing" ? "Average relative ballot completion order within each round; lower means earlier voting." : tab === "mutual" ? "The share of available ballot points two players gave each other." : "Average points per chance to vote for the recipient’s songs, including zeroes."}
                      defaultDirection={defaultRelationshipSortDirection(
                        tab === "alignment"
                          ? "alignment"
                          : tab === "timing"
                            ? "timing"
                            : tab === "mutual"
                              ? "share"
                              : "rate",
                      )}
                      params={currentParams}
                      path="/relationships"
                      sortKey={
                        tab === "alignment"
                          ? "alignment"
                          : tab === "timing"
                            ? "timing"
                            : tab === "mutual"
                              ? "share"
                              : "rate"
                      }
                    >
                      {valueLabel}
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[12%]"
                      defaultDirection="desc"
                      params={currentParams}
                      path="/relationships"
                      title={tab === "alignment" ? "Votes compared on songs both players could vote for." : tab === "timing" ? "Submitted ballots contributing to the timing average." : "Number of chances to vote for the other player’s songs."}
                      sortKey={tab === "alignment" ? "features" : "opportunities"}
                    >
                      {sampleLabel}
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[12%]"
                      defaultDirection="desc"
                      params={currentParams}
                      path="/relationships"
                      title={tab === "timing" ? "Rounds entered by submitting or voting in the selected scope." : tab === "alignment" ? "Rounds where both players voted and both showed variation on shared songs." : "Distinct rounds with eligible opportunities for this pair."}
                      sortKey="rounds"
                    >
                      Rounds
                    </SortableTableHead>
                    {tab === "given" || tab === "mutual" ? (
                      <SortableTableHead activeDirection={direction} activeSort={sort} align="right" defaultDirection="desc" params={currentParams} path="/relationships" sortKey="points" title="Total points awarded across the eligible opportunities shown.">Points</SortableTableHead>
                    ) : null}
                    <TableHead className="text-right" title={contextHelp}>{contextLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    return (
                      <TableRow key={`${row.leftId}-${row.rightId ?? "timing"}`}>
                        <TableCell className="max-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-zinc-100">
                            <Link className="min-w-0 truncate hover:text-lime-200" title={row.leftName} href={buildAnalyticsHref(`/players/${playerSlugs.get(row.leftId) ?? row.leftId}`, scopeQueryParams(filter), {})}>{row.leftName}</Link>
                            {row.rightId ? <>
                              <span aria-label={tab === "given" ? "gives points to" : "compared with"} className="shrink-0 text-lime-300">{tab === "given" ? "→" : "↔"}</span>
                              <Link className="min-w-0 truncate hover:text-lime-200" title={row.rightName ?? "Player"} href={buildAnalyticsHref(`/players/${playerSlugs.get(row.rightId ?? "") ?? row.rightId}`, scopeQueryParams(filter), {})}>{row.rightName}</Link>
                            </> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-lime-200">
                          {valueFor(tab, row)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {tab === "alignment"
                            ? (row.comparableFeatures ?? "—")
                            : tab === "timing"
                              ? (row.votedRounds ?? "—")
                              : (row.opportunities ?? "—")}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.sharedRounds ?? row.votedRounds ?? "—"}
                        </TableCell>
                        {tab === "given" || tab === "mutual" ? <TableCell className="text-right font-mono">{row.points ?? 0}</TableCell> : null}
                        <TableCell className="text-right text-xs text-zinc-400" title={contextHelp}>
                          {tab === "timing" ? row.missedBallots ?? 0 : tab === "alignment"
                            ? percent(row.scopeRounds ? (row.sharedRounds ?? 0) / row.scopeRounds : null)
                            : `${percent(row.positiveRate)} (${Math.round((row.positiveRate ?? 0) * (row.opportunities ?? 0))}/${row.opportunities ?? 0})`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-zinc-500">
              No comparison reaches the selected metric&apos;s scope and sample
              threshold.
            </p>
          )}
        </CardContent>
      </Card>

      <nav aria-label="Comparison pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
        {page > 1 ? <Link className={buttonStyles({variant:"secondary"})} href={buildAnalyticsHref("/relationships",currentParams,{page:page-1})}>Previous</Link> : <span />}
        <span className="text-zinc-400">{data.rows.length} results · Page {page} of {pageCount}</span>
        {page < pageCount ? <Link className={buttonStyles({variant:"secondary"})} href={buildAnalyticsHref("/relationships",currentParams,{page:page+1})}>Next</Link> : <span />}
      </nav>
    </Container>
  );
}

export default function RelationshipsPage(props: { searchParams: Promise<SearchParams>; }) {
  return <Suspense fallback={<AnalyticsLoadingShell />}><RelationshipsPageContent {...props} /></Suspense>;
}
