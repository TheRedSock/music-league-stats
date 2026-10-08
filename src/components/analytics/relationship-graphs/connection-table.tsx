"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ConnectionRow = { id: string; left: string; right: string; value: number | null; context?: string };
export function ConnectionTable({ rows, unit, onSelect }: { rows: ConnectionRow[]; unit: string; onSelect?: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = rows.filter(row => `${row.left} ${row.right}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => (ascending ? 1 : -1) * ((a.value ?? -Infinity) - (b.value ?? -Infinity)));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page,pages);
  return <details className="rounded-lg border border-white/10 p-4"><summary className="cursor-pointer text-sm font-medium">Connections as a table ({rows.length})</summary>
    <label className="my-4 block text-xs text-zinc-400">Search players<input type="search" className="mt-2 block h-10 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} /></label>
    <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm"><thead className="text-xs text-zinc-400"><tr><th scope="col" className="py-2">Player</th><th scope="col">Connected player</th><th scope="col" aria-sort={ascending ? "ascending" : "descending"}><button type="button" onClick={()=>{setAscending(!ascending);setPage(1);}}>{unit} {ascending ? "↑" : "↓"}</button></th><th scope="col">Context</th></tr></thead><tbody>
      {filtered.slice((current-1)*25,current*25).map(row=><tr key={row.id} className="border-t border-white/10"><td className="py-3">{onSelect ? <button type="button" className="text-lime-300 underline underline-offset-4" onClick={()=>onSelect(row.id)}>{row.left}</button> : row.left}</td><td>{row.right}</td><td className="tabular-nums">{row.value == null ? "—" : row.value.toFixed(2)}</td><td className="text-xs text-zinc-400">{row.context}</td></tr>)}
    </tbody></table></div>
    {!filtered.length ? <p className="py-3 text-sm text-zinc-400">No matching connections.</p> : null}
    {pages>1 ? <div className="mt-4 flex items-center justify-between gap-2 text-xs"><Button size="sm" variant="secondary" disabled={current<=1} onClick={()=>setPage(current-1)}>Previous</Button><span>{current} / {pages}</span><Button size="sm" variant="secondary" disabled={current>=pages} onClick={()=>setPage(current+1)}>Next</Button></div>:null}
  </details>;
}
