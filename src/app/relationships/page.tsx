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
  TruncatedCell,
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  defaultRelationshipSortDirection,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedRelationshipsTableData,
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
    tab: "received",
    label: "Received",
    description: "Points a player received from each voter per eligible opportunity.",
  },
  {
    tab: "given",
    label: "Given",
    description: "Points a player gave to each submitter per eligible opportunity.",
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

function playerName(row: RelationshipTableRow, focusId: string | null): string {
  if (!focusId) {
    return row.rightName ? `${row.leftName} / ${row.rightName}` : row.leftName;
  }
  return row.leftId === focusId ? (row.rightName ?? row.leftName) : row.leftName;
}

function playerHref(row: RelationshipTableRow, focusId: string | null): string {
  if (!focusId) return `/players/${row.leftId}`;
  return `/players/${row.leftId === focusId ? row.rightId : row.leftId}`;
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
  const tab = parseRelationshipTab(params.tab);
  const sort = parseRelationshipSort(params.sort, tab);
  const direction = parseRelationshipSortDirection(params.dir, sort);
  const focus = parseFocusPlayerId(params.focus);
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedRelationshipsTableData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
      tab,
      sort,
      direction,
      focus,
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
  if (data.needsScopeMaterialization && data.scopeKey) {
    const { ScopeMaterializationSplash } = await import(
      "@/components/analytics/analytics-building"
    );
    return (
      <Container className="py-10 sm:py-14">
        <div className="mb-8">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
        <ScopeMaterializationSplash
          leagueIds={filter.leagueIds}
          scopeKey={data.scopeKey}
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
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      className="w-[30%]"
                      defaultDirection="asc"
                      params={currentParams}
                      path="/relationships"
                      sortKey="player"
                    >
                      Player / pair
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[14%]"
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
                      Value
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[12%]"
                      defaultDirection="desc"
                      params={currentParams}
                      path="/relationships"
                      sortKey={tab === "alignment" ? "features" : "opportunities"}
                    >
                      Sample
                    </SortableTableHead>
                    <SortableTableHead
                      activeDirection={direction}
                      activeSort={sort}
                      align="right"
                      className="w-[12%]"
                      defaultDirection="desc"
                      params={currentParams}
                      path="/relationships"
                      sortKey="rounds"
                    >
                      Rounds
                    </SortableTableHead>
                    <TableHead className="text-right">Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const href = buildAnalyticsHref(
                      playerHref(row, data.focusPlayer?.id ?? null),
                      scopeQueryParams(filter),
                      {},
                    );
                    return (
                      <TableRow key={`${row.leftId}-${row.rightId ?? "timing"}`}>
                        <TableCell className="max-w-0">
                          <Link
                            className="block truncate font-medium text-zinc-100 hover:text-lime-200"
                            href={href}
                          >
                            <TruncatedCell title={playerName(row, data.focusPlayer?.id ?? null)}>
                              {playerName(row, data.focusPlayer?.id ?? null)}
                            </TruncatedCell>
                          </Link>
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
                          {row.scopeRounds ? `/${row.scopeRounds}` : ""}
                        </TableCell>
                        <TableCell className="text-right text-xs text-zinc-500">
                          {tab === "timing"
                            ? `${row.missedBallots ?? 0} missed ballots`
                            : tab === "mutual"
                              ? `${row.points ?? 0} pts · ${percent(row.positiveRate)} positive`
                              : tab === "alignment"
                                ? "features after scope threshold"
                                : `${row.points ?? 0} pts · ${percent(row.positiveRate)} positive`}
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
