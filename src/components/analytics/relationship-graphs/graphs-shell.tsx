import type { ReactNode } from "react";

import Link from "next/link";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsUnavailable } from "@/components/analytics/analytics-state";
import { Container } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import {
  buildAnalyticsHref,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  scopeQueryParams,
  type AnalyticsFilter,
  type AnalyticsLoad,
  type FilterOptions,
  type SearchParams,
} from "@/lib/analytics";
import type { RelationshipGraphData } from "@/lib/relationship-graph-shared";
import {
  getCachedRelationshipGraphData,
  getRelationshipGraphData,
  relationshipGraphCacheKeys,
} from "@/lib/relationship-graph";
import { cn } from "@/lib/utils";

export const GRAPH_VIEWS = [
  {
    id: "bubbles",
    label: "Bubbles",
    description:
      "Voting-pattern communities from thresholded alignment. Weaker players stay attached to their best-fit bubble.",
  },
  {
    id: "flow",
    label: "Flow",
    description:
      "Directed points-given support. Orange is one-way; blue is reciprocal; optional soft edges keep everyone on the map.",
  },
  {
    id: "matrix",
    label: "Matrix",
    description:
      "Cluster-ordered affinity heatmap for alignment or mutual ballot share across every pair.",
  },
  {
    id: "ego",
    label: "Ego",
    description:
      "One player at the center with neighbors above the strength cutoff; size scales with relationship strength.",
  },
] as const;

export type GraphViewId = (typeof GRAPH_VIEWS)[number]["id"];

export type RelationshipGraphsPayload = {
  filter: AnalyticsFilter;
  options: FilterOptions;
  graph: RelationshipGraphData | null;
  scopeError: string | null;
  scopeProgressLabel: string | null;
};

export function parseGraphView(
  value: string | string[] | undefined,
): GraphViewId {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "flow" || raw === "matrix" || raw === "ego" || raw === "bubbles") {
    return raw;
  }
  return "bubbles";
}

export async function loadRelationshipGraphs(
  searchParams: Promise<SearchParams>,
): Promise<AnalyticsLoad<RelationshipGraphsPayload>> {
  const params = await searchParams;
  return loadAnalytics(async () => {
    const { getCachedFilterOptions } = await import("@/lib/analytics");
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);

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

    if (!scopeReady) {
      return {
        filter,
        graph: null,
        options,
        scopeError,
        scopeProgressLabel,
      };
    }

    const keys = relationshipGraphCacheKeys(filter);
    let graph = await getCachedRelationshipGraphData(
      keys.leagueKey,
      keys.roundKey,
    );
    if (graph.needsScopeMaterialization && filter.leagueIds.length >= 2) {
      graph = await getRelationshipGraphData(filter);
    }

    return {
      filter,
      graph,
      options,
      scopeError: null,
      scopeProgressLabel: null,
    };
  });
}

export function GraphsShell({
  activeView,
  children,
  filter,
  options,
}: {
  activeView: GraphViewId;
  children: ReactNode;
  filter: AnalyticsFilter;
  options: FilterOptions;
}) {
  const active = GRAPH_VIEWS.find((view) => view.id === activeView) ?? GRAPH_VIEWS[0];

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Graphs
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Interactive relationship maps for vote-pattern alignment and mutual
            support. These describe ballot behavior, not friendship or listening
            taste.
          </p>
        </div>
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <nav
        aria-label="Relationship graph views"
        className="mt-8 flex flex-wrap gap-2"
      >
        {GRAPH_VIEWS.map((view) => (
          <Link
            key={view.id}
            className={cn(
              buttonStyles({ size: "sm", variant: "ghost" }),
              activeView === view.id
                ? "border border-lime-300/30 bg-lime-300/10 text-lime-100"
                : "border border-white/10 text-zinc-400",
            )}
            href={buildAnalyticsHref(
              "/relationships/graphs",
              scopeQueryParams(filter),
              { view: view.id },
            )}
          >
            {view.label}
          </Link>
        ))}
      </nav>

      <p className="mt-4 text-sm text-zinc-500">{active.description}</p>

      <div className="mt-6">{children}</div>
    </Container>
  );
}

export function GraphsUnavailable({
  result,
}: {
  result: Exclude<
    AnalyticsLoad<RelationshipGraphsPayload>,
    { status: "ready" }
  >;
}) {
  return (
    <Container className="py-16 sm:py-24">
      <AnalyticsUnavailable
        progressLabel={
          result.status === "building" ? result.progressLabel : null
        }
        status={result.status}
      />
    </Container>
  );
}
