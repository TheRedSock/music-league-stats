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
    "Interactive relationship graphs for vote-pattern alignment, mutual support, and directed voting flow.",
};

export default async function RelationshipGraphsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = parseGraphView(params.view);
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
