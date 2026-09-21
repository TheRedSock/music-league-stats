import { qualificationRoundFloor, qualificationFeatureFloor } from "@/lib/participation";
import { Network, Search } from "lucide-react";
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

export const metadata: Metadata = {
  title: "Compare",
  description: "Full scope-aware player relationship comparison tables.",
};

const tabs: Array<{ tab: RelationshipTab; label: string; description: string }> = [
  {
    tab: "given",
    label: "Support",
    description: "Directional support: giver → receiver. Each direction is a separate row.",
  },
  {
    tab: "mutual",
    label: "Mutual",
    description: "Combined support between two players in both directions.",
  },
  {
    tab: "alignment",
    label: "Alignment",
    description: "Budget-normalized vote-pattern similarity for qualifying pairs.",
  },
  {
    tab: "timing",
    label: "Timing",
    description: "Average ballot completion percentile inside each round.",
  },
];

function percent(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function metric(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function valueFor(tab: RelationshipTab, row: RelationshipTableRow): string {
  if (tab === "alignment") return percent(row.alignment);
  if (tab === "timing") return percent(row.averageTiming);
  if (tab === "mutual") return percent(row.ballotPointShare, 1);
  return metric(row.pointsPerOpportunity);
}

export default async function RelationshipsPage({
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
      if (scopeStatus.status === "failed") {
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
      <Container className="py-10 sm:py-14">
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
  const valueLabel = tab === "alignment" ? "Alignment" : tab === "timing" ? "Ballot position" : tab === "mutual" ? "Ballot share" : "Pts / opportunity";
  const sampleLabel = tab === "alignment" ? "Vote features" : tab === "timing" ? "Ballots cast" : "Opportunities";
  const contextLabel = tab === "timing" ? "Missed ballots" : tab === "alignment" ? "Scope covered" : "Awarded ≥1 pt";
  const contextHelp = tab === "timing" ? "Entered rounds where the player did not cast a ballot." : tab === "alignment" ? "Shared voted rounds divided by all rounds in the selected scope." : "Percentage and count of eligible song-voter opportunities awarded at least one point; the rest received zero points. Mutual support combines both directions.";

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
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
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <Card className="mt-9">
        <CardHeader>
          <Network aria-hidden="true" className="mb-2 size-5 text-lime-300" />
          <CardTitle>{activeTab.label} comparisons</CardTitle>
          <CardDescription>{activeTab.description}</CardDescription>
          <p className="text-xs leading-5 text-zinc-500">
            {tab === "timing"
              ? "Lower ballot position means earlier voting. Missed ballots are excluded from the average."
              : `Requires ${minimumRounds} of ${scopeRounds} scope rounds${tab === "alignment" ? ` and ${qualificationFeatureFloor(scopeRounds, options.rounds.length)} comparable vote features` : ""}. The participation floor rises toward half for small scopes and eases to one third at full scope.`}
            {tab === "alignment" ? " Features compare budget-normalized votes for other players’ songs, plus support exchanged between the pair." : ""}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((item) => (
              <Link
                className={
                  item.tab === tab
                    ? "rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-xs font-medium text-lime-100"
                    : "rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-white"
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
                      title={tab === "alignment" ? "Cosine similarity of budget-normalized vote patterns; higher means more similar voting." : tab === "timing" ? "Average relative ballot completion order within each round; lower means earlier voting." : tab === "mutual" ? "Combined points exchanged divided by the eligible ballot budgets of both players." : "Points awarded divided by eligible opportunities, including zero-point votes."}
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
                      title={tab === "alignment" ? "Comparable budget-normalized vote features used for cosine similarity." : tab === "timing" ? "Submitted ballots contributing to the timing average." : "Eligible song-voter combinations, including inferred zeroes; excludes self-votes and missing ballots."}
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
                      title={tab === "timing" ? "Rounds entered by submitting or voting in the selected scope." : "Distinct rounds with eligible opportunities for this pair; alignment requires both players to have voted."}
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
                  {data.rows.map((row) => {
                    return (
                      <TableRow key={`${row.leftId}-${row.rightId ?? "timing"}`}>
                        <TableCell className="max-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-zinc-100">
                            <Link className="min-w-0 truncate hover:text-lime-200" title={row.leftName} href={buildAnalyticsHref(`/players/${row.leftId}`, scopeQueryParams(filter), {})}>{row.leftName}</Link>
                            {row.rightId ? <>
                              <span aria-label={tab === "given" ? "gives points to" : "compared with"} className="shrink-0 text-lime-300">{tab === "given" ? "→" : "↔"}</span>
                              <Link className="min-w-0 truncate hover:text-lime-200" title={row.rightName ?? "Player"} href={buildAnalyticsHref(`/players/${row.rightId}`, scopeQueryParams(filter), {})}>{row.rightName}</Link>
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

      <Card className="mt-6 border-dashed">
        <CardContent className="flex items-start gap-3 p-5 text-sm leading-6 text-zinc-400">
          <Search aria-hidden="true" className="mt-1 size-4 shrink-0 text-zinc-600" />
          These tables use the same inferred-zero, scope-aware metrics as the
          player profile summaries. Focused links from a profile preselect that
          player and sort by the clicked section&apos;s metric.
        </CardContent>
      </Card>
    </Container>
  );
}
