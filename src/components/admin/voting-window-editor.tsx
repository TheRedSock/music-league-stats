"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/request-json";

type RoundWindow = {id:string;name:string;ordinal:number;opensAt:string|null;closesAt:string|null;estimatedOpensAt:string|null;estimatedClosesAt:string|null;source:string};
function localInput(instant:string|null) {
  if (!instant) return "";
  const date=new Date(instant);
  return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
function WindowForm({round,onSaved}: {round:RoundWindow;onSaved:(message:string)=>void}) {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function save(clear=false,form?:HTMLFormElement) {
    const values=form ? new FormData(form) : null;
    const opens=String(values?.get("opensAt") ?? ""),closes=String(values?.get("closesAt") ?? "");
    setBusy(true);setMessage("");
    try {
      if (!clear && (!opens || !closes)) throw new Error("Set both times, or use the estimate.");
      const result=await requestJson<{message:string}>(`/api/admin/rounds/${round.id}/voting-window`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({opensAt:clear ? null : new Date(opens).toISOString(),closesAt:clear ? null : new Date(closes).toISOString()})},"Save voting window");
      setMessage(result.message);onSaved(result.message);
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not save.");} finally {setBusy(false);}
  }
  const date=(value:string)=>new Date(value).toLocaleString("en-GB",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"});
  return <form className="border-t border-white/10 py-4" onSubmit={event=>{event.preventDefault();void save(false,event.currentTarget);}}>
    <p className="text-sm">R{round.ordinal} · {round.name}</p>
    <p className="mt-1 text-xs text-zinc-500">{round.estimatedOpensAt && round.estimatedClosesAt ? `${round.source === "set" ? "Current window" : "Estimate"}: ${date(round.estimatedOpensAt)} – ${date(round.estimatedClosesAt)}` : "No usable estimate."}</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-0 text-xs text-zinc-400">Opens<input aria-label={`Round ${round.ordinal} voting opens`} className="mt-1 block max-w-full rounded-md border border-white/10 bg-zinc-950 p-2" type="datetime-local" name="opensAt" defaultValue={localInput(round.opensAt)} required disabled={busy} /></label>
      <label className="min-w-0 text-xs text-zinc-400">Closes<input aria-label={`Round ${round.ordinal} voting closes`} className="mt-1 block max-w-full rounded-md border border-white/10 bg-zinc-950 p-2" type="datetime-local" name="closesAt" defaultValue={localInput(round.closesAt)} required disabled={busy} /></label>
      <Button disabled={busy} size="sm" type="submit">Save exact times</Button><Button disabled={busy || !round.opensAt && !round.closesAt} size="sm" variant="secondary" type="button" onClick={()=>void save(true)}>Use estimate</Button>
    </div>
    {message ? <p role="status" className="mt-2 text-xs text-zinc-300">{message}</p> : null}
  </form>;
}
export function VotingWindowEditor({leagueId}: {leagueId:string}) {
  const [notice,setNotice]=useState("");
  const [rows,setRows]=useState<RoundWindow[]|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function load(){setLoading(true);setError("");try{const data=await requestJson<{rounds:RoundWindow[]}>(`/api/admin/leagues/${leagueId}/voting-windows`,{},"Load voting windows");setRows(data.rounds);}catch(error){setError(error instanceof Error ? error.message : "Could not load.");}finally{setLoading(false);}}
  return <details className="mt-6 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm text-zinc-300">Round voting windows</summary>
    <p className="my-3 text-xs leading-5 text-zinc-400">Estimates use submission/vote timestamps and likely schedule boundaries in Europe/Oslo. Exact times override estimates and survive CSV imports. Inputs use your browser’s local time zone; refresh analytics after saving.</p>
    {notice ? <p role="status" className="mb-3 text-xs text-lime-300">{notice}</p> : null}
    {rows ? rows.map(round=><WindowForm key={`${round.id}:${round.opensAt}:${round.closesAt}`} round={round} onSaved={message=>{setNotice(message);void load();}}/>) : <Button size="sm" variant="secondary" disabled={loading} onClick={()=>void load()}>{loading ? "Loading…" : "Load round windows"}</Button>}
    {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
  </details>;
}
