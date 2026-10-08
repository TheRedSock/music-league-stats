import Link from "next/link";
import { FactPanelDialog } from "./fact-panel-dialog";
import { MusicLeagueScopeLinks } from "./music-league-link";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { buildAnalyticsHref, leagueTableLabel, type QueryValue, type SearchParams, type TimingRow } from "@/lib/analytics";
import { detailPage, type FactDetail } from "@/lib/detail-pagination";
import { musicLeagueUrl } from "@/lib/music-league-urls";

function position(row: TimingRow) {
  if (row.ballotRank == null) return "No ballot recorded";
  const last = row.ballotRank + (row.tieCount ?? 1) - 1;
  return `${row.ballotRank}${last > row.ballotRank ? `–${last}` : ""} of ${row.observedVoters}`;
}
function RoundLink({ row }: { row: TimingRow }) {
  return <MusicLeagueScopeLinks
    leagueHref={musicLeagueUrl(row.leagueMusicLeagueId)} leagueLabel={leagueTableLabel({ name: row.leagueName, slug: row.leagueSlug })} leagueTitle={row.leagueName}
    roundHref={musicLeagueUrl(row.leagueMusicLeagueId, row.sourceRoundId)} roundLabel={`R${row.ordinal} · ${row.roundName}`} roundTitle={row.roundName} />;
}

/** Full round rows are rendered only for the requested detail page. */
export function PlayerTimingPanel({ rows, path, filterParams, query }: {
  rows: TimingRow[]; path: string; filterParams: Record<string, QueryValue>; query: SearchParams;
}) {
  const voted = rows.filter(row => row.relativeOrder !== null).sort((a,b) => a.relativeOrder! - b.relativeOrder! || a.roundId.localeCompare(b.roundId));
  const average = voted.length ? voted.reduce((sum,row) => sum + row.relativeOrder!,0) / voted.length : null;
  const early = voted.slice(0,3);
  const late = voted.slice(-3).reverse().filter(row => !early.includes(row));
  const missed = rows.filter(row => row.participation === "did_not_vote").length;
  const open = query.timing === "all";
  const search = typeof query.detailSearch === "string" ? query.detailSearch.slice(0,160) : "";
  const pagination = detailPage(open ? [...voted, ...rows.filter(row => row.relativeOrder === null)] : [], search, Number(query.detailPage ?? 1));
  const base = { ...filterParams, timing: "all", detailSearch: search };
  const detail: FactDetail = {
    open, href: buildAnalyticsHref(path, filterParams, { timing: "all" }), closeHref: buildAnalyticsHref(path, filterParams, {}),
    previousHref: buildAnalyticsHref(path,base,{detailPage:pagination.page-1}), nextHref: buildAnalyticsHref(path,base,{detailPage:pagination.page+1}),
    page: pagination.page, pageCount: pagination.pageCount, total: pagination.total, search,
  };
  return <Card id="voting-order">
    <CardHeader>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><CardTitle>When they vote</CardTitle><Link className="text-xs text-lime-300 hover:underline" href={buildAnalyticsHref("/relationships",filterParams,{tab:"timing",sort:"timing",dir:"asc"})}>Compare players →</Link></div>
      <CardDescription>Ballot position within each round. Lower means earlier.</CardDescription>
    </CardHeader>
    <CardContent>
      {average !== null ? <>
        <p className="text-xs text-zinc-400">Average ballot position</p>
        <p className="mt-1 font-mono text-3xl font-semibold text-violet-200">{(average*100).toFixed(0)}%</p>
        <div className="relative mt-3 h-1.5 rounded-full bg-white/10"><span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300" style={{left:`${average*100}%`}} /></div>
        <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>0% · Early</span><span>Late · 100%</span></div>
        <p className="mt-2 text-xs text-zinc-400">Across {voted.length} recorded ballots{missed ? ` · ${missed} missing` : ""}.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {[{label:"Earliest rounds",list:early},{label:"Latest rounds",list:late}].filter(group=>group.list.length).map(group=><div key={group.label}><h3 className="text-sm text-zinc-400">{group.label}</h3><ol className="mt-2 divide-y divide-white/5">{group.list.map(row=><li key={row.roundId} className="py-2.5"><p className="truncate text-xs"><RoundLink row={row}/></p><p className="mt-1 text-xs text-zinc-500"><span className="font-mono text-violet-200">{(row.relativeOrder!*100).toFixed(0)}%</span> · {position(row)}</p></li>)}</ol></div>)}
        </div>
      </> : <p className="text-sm text-zinc-400">No ballot timing recorded in this scope.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {rows.length > 0 ? <FactPanelDialog itemCount={rows.length} title="Voting order by round" description="Earliest to latest. Missing ballots appear last and are excluded from the average." detail={detail}>
          {open ? <Table className="min-w-[520px] table-fixed"><TableHeader><TableRow><TableHead className="w-[55%]">League / round</TableHead><TableHead>Voting order</TableHead><TableHead className="text-right" title="Position within the round, from early to late. Lower means earlier.">Ballot position</TableHead></TableRow></TableHeader><TableBody>{pagination.rows.map(row=><TableRow key={row.roundId}><TableCell><div className="truncate" title={`${row.leagueName} · ${row.roundName}`}><RoundLink row={row}/></div></TableCell><TableCell>{position(row)}</TableCell><TableCell className="text-right font-mono">{row.relativeOrder == null ? "—" : `${(row.relativeOrder*100).toFixed(0)}%`}</TableCell></TableRow>)}</TableBody></Table> : null}
        </FactPanelDialog> : null}
        <Link href="/faq#timing" className="text-xs text-zinc-400 underline underline-offset-4">How timing is measured</Link>
      </div>
    </CardContent>
  </Card>;
}
