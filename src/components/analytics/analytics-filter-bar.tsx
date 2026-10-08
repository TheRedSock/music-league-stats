"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Popover } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { AnalyticsFilter, FilterOptions } from "@/lib/analytics";

export function AnalyticsFilterBar({ filter, options }: { filter: AnalyticsFilter; options: FilterOptions }) {
  return <ScopePicker key={filter.leagueIds.join(",")} filter={filter} options={options} />;
}

function ScopePicker({ filter, options }: { filter: AnalyticsFilter; options: FilterOptions }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leagueIds, setLeagueIds] = useState(filter.leagueIds);
  const selected = options.leagues.filter(league => filter.leagueIds.includes(league.id));
  const label = selected.length === 1 ? selected[0].name : selected.length ? `${selected.length} leagues` : "All leagues";
  function apply(ids: string[]) {
    const query = new URLSearchParams(window.location.search);
    query.delete("league"); query.delete("round"); query.delete("page");
    for (const id of ids) query.append("league", id);
    startTransition(() => router.push(`${pathname}${query.size ? `?${query}` : ""}`));
  }
  return <div role="group" aria-label="League selection" className="min-w-0">
    <Popover label="Choose leagues" className="w-96" triggerClassName="h-auto min-h-11 max-w-full justify-between py-2 text-left whitespace-normal"
      trigger={<><span>{pending ? "Loading results…" : label}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" /></>}>
      <p className="mb-3 text-sm font-semibold">Choose leagues</p>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setLeagueIds([])}>All leagues</Button>
        {options.defaultLeagueId ? <Button size="sm" variant="secondary" onClick={() => setLeagueIds([options.defaultLeagueId!])}>Latest league</Button> : null}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {options.leagues.map(league => <label key={league.id} className="flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-sm leading-5 hover:bg-white/5">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-lime-300" checked={leagueIds.includes(league.id)} onChange={() => setLeagueIds(current => current.includes(league.id) ? current.filter(id => id !== league.id) : [...current, league.id].sort())} />
          <span>{league.name}</span>
        </label>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-xs text-zinc-400">{leagueIds.length ? `${leagueIds.length} selected` : "All leagues selected"}</span>
        <Button size="sm" disabled={pending} onClick={event => { apply(leagueIds); event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); }}>Show results</Button>
      </div>
    </Popover>
    <span className="sr-only" aria-live="polite">{pending ? "Loading results" : "Results updated"}</span>
  </div>;
}
