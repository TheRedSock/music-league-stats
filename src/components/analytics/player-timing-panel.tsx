import Link from "next/link";
import { FactPanelDialog } from "./fact-panel-dialog";
import { MusicLeagueScopeLinks } from "./music-league-link";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { buildAnalyticsHref, leagueTableLabel, type QueryValue, type SearchParams, type TimingRow } from "@/lib/analytics";
import { combinedTiming, parseTimingMeasure, type TimingMeasure } from "@/lib/voting-timing";
import { detailPage, type FactDetail } from "@/lib/detail-pagination";
import { musicLeagueUrl } from "@/lib/music-league-urls";

const measures: Array<{ id: TimingMeasure; label: string; sort: string }> = [
  {id:"order",label:"Voting order",sort:"timing"}, {id:"window",label:"Voting window",sort:"window-timing"}, {id:"combined",label:"Combined",sort:"combined-timing"},
];
const percent = (value: number | null) => value === null ? "—" : `${(value*100).toFixed(0)}%`;
const score = (row: TimingRow, measure: TimingMeasure) => measure === "order" ? row.relativeOrder : measure === "window" ? row.windowPosition : combinedTiming(row.relativeOrder,row.windowPosition);
function average(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum,value)=>sum+value,0)/known.length : null;
}
function position(row: TimingRow) {
  if (row.ballotRank == null) return "No ballot recorded";
  const last = row.ballotRank + (row.tieCount ?? 1) - 1;
  return `${row.ballotRank}${last > row.ballotRank ? `–${last}` : ""} of ${row.observedVoters}`;
}
function RoundLink({row}: {row: TimingRow}) {
  return <MusicLeagueScopeLinks leagueHref={musicLeagueUrl(row.leagueMusicLeagueId)} leagueLabel={leagueTableLabel({name:row.leagueName,slug:row.leagueSlug})} leagueTitle={row.leagueName} roundHref={musicLeagueUrl(row.leagueMusicLeagueId,row.sourceRoundId)} roundLabel={`R${row.ordinal} · ${row.roundName}`} roundTitle={row.roundName} />;
}
function windowTitle(row: TimingRow) {
  if (!row.windowOpensAt || !row.windowClosesAt) return "No usable voting window.";
  const date = (value: string) => new Date(value).toLocaleString("en-GB",{timeZone:"Europe/Oslo",timeZoneName:"short"});
  return `${row.windowSource === "estimated" ? "Estimated" : "Set"} window: ${date(row.windowOpensAt)} – ${date(row.windowClosesAt)}${row.castAt ? `. Ballot: ${date(row.castAt)}` : ""}`;
}

/** Only the requested page of round details reaches the initial HTML. */
export function PlayerTimingPanel({rows,path,filterParams,query}: {rows:TimingRow[];path:string;filterParams:Record<string,QueryValue>;query:SearchParams}) {
  const measure=parseTimingMeasure(query.timingMeasure), selected=measures.find(item=>item.id===measure)!;
  const voted=rows.filter(row=>row.participation==="voted"), windowed=voted.filter(row=>row.windowPosition!==null);
  const estimated=windowed.filter(row=>row.windowSource==="estimated").length, missed=rows.length-voted.length;
  const averages=Object.fromEntries(measures.map(item=>[item.id,average(voted.map(row=>score(row,item.id)))])) as Record<TimingMeasure,number|null>;
  const ranked=[...rows].sort((a,b)=>{const left=score(a,measure),right=score(b,measure);return left===null ? right===null ? a.ordinal-b.ordinal : 1 : right===null ? -1 : left-right || a.roundId.localeCompare(b.roundId);});
  const known=ranked.filter(row=>score(row,measure)!==null), early=known.slice(0,3), late=known.slice(-3).reverse().filter(row=>!early.includes(row));
  const open=query.timing==="all", search=typeof query.detailSearch==="string" ? query.detailSearch.slice(0,160) : "";
  const pagination=detailPage(open ? ranked : [],search,Number(query.detailPage??1));
  const selectedParams={...filterParams,timingMeasure:measure},base={...selectedParams,timing:"all",detailSearch:search};
  const detail:FactDetail={open,href:buildAnalyticsHref(path,selectedParams,{timing:"all"}),closeHref:buildAnalyticsHref(path,selectedParams,{}),previousHref:buildAnalyticsHref(path,base,{detailPage:pagination.page-1}),nextHref:buildAnalyticsHref(path,base,{detailPage:pagination.page+1}),page:pagination.page,pageCount:pagination.pageCount,total:pagination.total,search};
  const currentAverage=averages[measure];
  return <Card id="voting-order">
    <CardHeader>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><CardTitle>When they vote</CardTitle><Link className="text-xs text-lime-300 hover:underline" href={buildAnalyticsHref("/relationships",filterParams,{tab:"timing",sort:selected.sort,dir:"asc"})}>Compare players →</Link></div>
      <CardDescription>Among other voters, across the voting window, or an equal mix. Lower means earlier.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-3 gap-2" aria-label="Average voting timing">{measures.map(item=><Link scroll={false} key={item.id} aria-current={measure===item.id ? "true" : undefined} className={`rounded-md border px-2 py-3 sm:px-3 ${measure===item.id ? "border-violet-300/40 bg-violet-300/5" : "border-white/10 hover:border-white/25"}`} href={buildAnalyticsHref(path,filterParams,{timingMeasure:item.id,timing:open ? "all" : null})}><span className="block min-h-8 text-xs leading-4 text-zinc-400 sm:min-h-4">{item.label}</span><span className="mt-2 block font-mono text-xl text-violet-200 sm:text-2xl">{percent(averages[item.id])}</span><span className="mt-1 block text-[11px] text-zinc-500">{item.id==="order" ? voted.length : windowed.length} ballots</span></Link>)}</div>
      {rows.length ? <p className="mt-3 text-xs text-zinc-400">{missed}/{rows.length} entered rounds missed ({(missed/rows.length*100).toFixed(1)}%).{estimated ? ` ${estimated} of ${windowed.length} usable windows are estimated.` : ""}</p> : null}
      {currentAverage!==null ? <>
        <div className="relative mt-5 h-1.5 rounded-full bg-white/10"><span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300" style={{left:`${Math.max(0,Math.min(1,currentAverage))*100}%`}} /></div>
        <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>0% · {measure==="window" ? "Opening" : "Early"}</span><span>{measure==="window" ? "Closing" : "Late"} · 100%</span></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">{[{label:"Earliest rounds",list:early},{label:"Latest rounds",list:late}].filter(group=>group.list.length).map(group=><div key={group.label}><h3 className="text-sm text-zinc-400">{group.label}</h3><ol className="mt-2 divide-y divide-white/5">{group.list.map(row=><li key={row.roundId} className="py-2.5"><p className="truncate text-xs"><RoundLink row={row}/></p><p className="mt-1 text-xs text-zinc-500" title={measure==="order" ? undefined : windowTitle(row)}><span className="font-mono text-violet-200">{percent(score(row,measure))}</span> · {measure==="order" ? position(row) : row.windowSource==="estimated" ? "Estimated window" : "Window set in Admin"}</p></li>)}</ol></div>)}</div>
      </> : <p className="mt-4 text-sm text-zinc-400">{measure==="order" ? "No ballot timing recorded in this scope." : "No usable voting windows in this scope. Vote order remains available; exact windows can be set in Admin."}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {rows.length ? <FactPanelDialog itemCount={rows.length} title="Voting timing by round" description={`Sorted by ${selected.label.toLowerCase()}. Missing values appear last. Window estimates use Europe/Oslo schedule boundaries.`} detail={detail}>
          {open ? <Table className="min-w-[780px]"><TableHeader><TableRow><TableHead>League / round</TableHead><TableHead>Voting order</TableHead><TableHead className="text-right">Order</TableHead><TableHead className="text-right">Voting window</TableHead><TableHead className="text-right">Combined</TableHead><TableHead>Window source</TableHead></TableRow></TableHeader><TableBody>{pagination.rows.map(row=><TableRow key={row.roundId}><TableCell className="max-w-72"><div className="truncate"><RoundLink row={row}/></div></TableCell><TableCell className="whitespace-nowrap">{position(row)}</TableCell><TableCell className="text-right font-mono">{percent(row.relativeOrder)}</TableCell><TableCell className="text-right font-mono" title={windowTitle(row)}>{percent(row.windowPosition)}</TableCell><TableCell className="text-right font-mono">{percent(combinedTiming(row.relativeOrder,row.windowPosition))}</TableCell><TableCell className="max-w-64 text-xs"><details><summary className="cursor-pointer">{row.windowSource==="estimated" ? "Estimated" : row.windowSource==="set" ? "Set in Admin" : "Unavailable"}</summary><p className="mt-2 max-w-64 whitespace-normal leading-5 text-zinc-400">{windowTitle(row)}</p></details></TableCell></TableRow>)}</TableBody></Table> : null}
        </FactPanelDialog> : null}
        <Link href="/faq#timing" className="text-xs text-zinc-400 underline underline-offset-4">How timing is measured</Link>
      </div>
    </CardContent>
  </Card>;
}
