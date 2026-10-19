import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buildAnalyticsHref, playerPath, type MutualRelationship, type QueryValue } from "@/lib/analytics";

export function MutualSupportPanel({ rows, filterParams, compareHref }: {
  rows: MutualRelationship[]; filterParams: Record<string, QueryValue>; compareHref: string;
}) {
  const supported = rows.filter(row => row.relativeSupport !== null);
  function groups(measure: "relativeSupport" | "ballotPointShare") {
    const ranked = [...supported].sort((a,b) => b[measure]! - a[measure]! || a.competitorName.localeCompare(b.competitorName));
    const strongest=ranked.slice(0,3);
    return [{ label: "Strongest support", rows: strongest }, { label: "Weakest support", rows: ranked.slice(-3).reverse().filter(row=>!strongest.includes(row)) }].filter(group=>group.rows.length).map(group => <div key={group.label}>
      <h3 className="text-sm text-zinc-400">{group.label}</h3>
      <ol className="mt-2 divide-y divide-white/5">{group.rows.map(row => <li key={row.competitorId} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0"><Link className="block truncate text-sm text-zinc-100 hover:text-lime-200" href={buildAnalyticsHref(playerPath({id:row.competitorId,slug:row.competitorSlug}),filterParams,{})}>{row.competitorName}</Link><p className="mt-1 text-xs text-zinc-500">{row.points} points · {row.sharedRounds} rounds</p></div>
        <span className="shrink-0 font-mono text-sm text-lime-200">{measure === "relativeSupport" ? `${row.relativeSupport!.toFixed(2)}×` : `${(row.ballotPointShare*100).toFixed(1)}%`}</span>
      </li>)}</ol>
    </div>);
  }
  return <Card className="mt-6">
    <CardHeader>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><CardTitle>Mutual voting support</CardTitle><Link className="text-xs text-lime-300 hover:underline" href={compareHref}>View all →</Link></div>
      <CardDescription>Points exchanged relative to the available choices in each round. 1× is expected support.</CardDescription>
    </CardHeader>
    <CardContent>
      {supported.length ? <><div className="grid gap-7 sm:grid-cols-2">{groups("relativeSupport")}</div>
        <details className="mt-5 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm text-zinc-400">Ballot share</summary><p className="mt-2 text-xs text-zinc-500">Share of both players’ eligible ballot budgets spent on each other.</p><div className="mt-3 grid gap-7 sm:grid-cols-2">{groups("ballotPointShare")}</div></details>
      </> : <p className="text-sm text-zinc-400">No mutual comparison meets the participation minimum for this scope.</p>}
      <Link className="mt-4 inline-block text-xs text-zinc-400 underline underline-offset-4" href="/faq#support">How support is measured</Link>
    </CardContent>
  </Card>;
}
