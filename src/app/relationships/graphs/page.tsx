import type { Metadata } from "next";

import { ScopeMaterializationSplash } from "@/components/analytics/analytics-building";
import { BubblesView } from "@/components/analytics/relationship-graphs/bubbles-view";
import { EgoView } from "@/components/analytics/relationship-graphs/ego-view";
import { FlowView } from "@/components/analytics/relationship-graphs/flow-view";
import {
  GraphsShell,
  GraphsUnavailable,
  loadRelationshipGraphs,
  parseGraphView,
} from "@/components/analytics/relationship-graphs/graphs-shell";
import { MatrixView } from "@/components/analytics/relationship-graphs/matrix-view";
import { ProgressionView } from "@/components/analytics/relationship-graphs/progression-view";
import { encodeScopeIds, getCachedFilterOptions, getCachedScoreProgression, loadAnalytics, parseAnalyticsFilters, resolveAnalyticsFilter } from "@/lib/analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SearchParams } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Graphs",
  description:
    "Score progression across rounds and interactive voting relationship graphs.",
};

export default async function RelationshipGraphsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = parseGraphView(params.view);
  if (view === "progression") {
    const progression = await loadAnalytics(async () => {
      const options = await getCachedFilterOptions();
      const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
      const rows = await getCachedScoreProgression(encodeScopeIds(filter.leagueIds), encodeScopeIds(filter.roundIds));
      return { options, filter, rows };
    });
    if (progression.status !== "ready") return <GraphsUnavailable result={progression} />;
    const { options, filter, rows } = progression.data;
    return <GraphsShell activeView={view} filter={filter} options={options}>
      <ProgressionView rows={rows} leagues={options.leagues} subset={filter.roundIds.length > 0} />
    </GraphsShell>;
  }
  const result = await loadRelationshipGraphs(searchParams);

  if (result.status !== "ready") {
    return <GraphsUnavailable result={result} />;
  }

  const { filter, graph, options, scopeError, scopeProgressLabel } = result.data;

  return (
    <GraphsShell activeView={view} filter={filter} options={options}>
      {!graph ? (
        <ScopeMaterializationSplash
          errorMessage={scopeError}
          progressLabel={scopeProgressLabel}
        />
      ) : graph.needsScopeMaterialization ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Scope still preparing</CardTitle>
            <CardDescription>
              Multi-league relationship data is not ready for this combination
              yet. Stay on this page or open Compare while it finishes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500">
              Scope key: {graph.scopeKey ?? "—"}
            </p>
          </CardContent>
        </Card>
      ) : view === "flow" ? (
        <FlowView graph={graph} />
      ) : view === "matrix" ? (
        <MatrixView graph={graph} />
      ) : view === "ego" ? (
        <EgoView graph={graph} />
      ) : (
        <BubblesView graph={graph} />
      )}
    </GraphsShell>
  );
}
