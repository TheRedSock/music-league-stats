"use client";

import { Check, ChevronDown, Filter, LoaderCircle, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type {
  AnalyticsFilter,
  FilterOptions,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function AnalyticsFilterBar({
  filter,
  options,
}: {
  filter: AnalyticsFilter;
  options: FilterOptions;
}) {
  return (
    <AnalyticsFilterBarContent
      filter={filter}
      key={filter.leagueIds.join(",")}
      options={options}
    />
  );
}

function AnalyticsFilterBarContent({
  filter,
  options,
}: {
  filter: AnalyticsFilter;
  options: FilterOptions;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leagueIds, setLeagueIds] = useState(filter.leagueIds);
  const [openMenu, setOpenMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenu]);

  function toggleLeague(id: string) {
    setLeagueIds((current) => {
      const next = current.includes(id)
        ? current.filter((leagueId) => leagueId !== id)
        : [...current, id].sort();
      return next;
    });
  }

  function pushScope(nextLeagueIds = leagueIds) {
    const next = new URLSearchParams(window.location.search);
    next.delete("league");
    next.delete("round");
    for (const leagueId of nextLeagueIds) next.append("league", leagueId);
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}${next.size ? `?${next}` : ""}`);
    });
  }

  const scopeChanged = leagueIds.join(",") !== filter.leagueIds.join(",");
  const selectedLeagues = options.leagues.filter((league) =>
    leagueIds.includes(league.id),
  );
  const latestLeagueActive =
    Boolean(options.defaultLeagueId) &&
    leagueIds.length === 1 &&
    leagueIds[0] === options.defaultLeagueId;

  return (
    <div
      aria-label="Analytics filters"
      className="rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-2.5 shadow-2xl shadow-black/10"
      ref={rootRef}
      role="group"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          {pending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin text-lime-300"
            />
          ) : (
            <Filter aria-hidden="true" className="size-4 text-lime-300" />
          )}
          Scope
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {options.defaultLeagueId ? (
            <button
              aria-pressed={latestLeagueActive}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition",
                latestLeagueActive
                  ? "border-lime-300/40 bg-lime-300/10 text-lime-100"
                  : "border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/20",
              )}
              disabled={pending}
              onClick={() => {
                const latestLeagueIds = [options.defaultLeagueId!];
                setLeagueIds(latestLeagueIds);
                pushScope(latestLeagueIds);
              }}
              type="button"
            >
              Latest league
            </button>
          ) : null}
          <div className="relative shrink-0">
            <button
              aria-expanded={openMenu}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 outline-none transition hover:border-white/20 focus-visible:ring-2 focus-visible:ring-lime-300/40"
              onClick={() => setOpenMenu((current) => !current)}
              type="button"
            >
              Leagues
              <span className="font-mono text-[10px] text-lime-300">
                {leagueIds.length || "All"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 text-zinc-500 transition-transform",
                  openMenu && "rotate-180",
                )}
              />
            </button>
            {openMenu ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[80vw] rounded-2xl border border-white/10 bg-zinc-950 p-2 shadow-2xl shadow-black/60">
                <button
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  onClick={() => setLeagueIds([])}
                  type="button"
                >
                  All leagues
                  {!leagueIds.length ? (
                    <Check aria-hidden="true" className="size-4 text-lime-300" />
                  ) : null}
                </button>
                <div className="my-1 border-t border-white/[0.06]" />
                <div className="max-h-64 overflow-y-auto pr-1">
                  {options.leagues.map((league) => (
                    <label
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                      key={league.id}
                    >
                      <input
                        checked={leagueIds.includes(league.id)}
                        className="mt-0.5 size-3.5 shrink-0 accent-lime-300"
                        onChange={() => toggleLeague(league.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0 leading-5">{league.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div
            aria-label="Selected scope"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {selectedLeagues.length ? (
              selectedLeagues.map((league) => (
                <button
                  className="inline-flex h-8 max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-lime-300/20 bg-lime-300/[0.07] pl-3 pr-2 text-xs text-lime-100 hover:border-lime-300/40"
                  key={league.id}
                  onClick={() => toggleLeague(league.id)}
                  title={`Remove ${league.name}`}
                  type="button"
                >
                  <span className="truncate">{league.name}</span>
                  <X aria-hidden="true" className="size-3 shrink-0" />
                </button>
              ))
            ) : (
              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-white/10 px-3 text-xs text-zinc-400">
                All leagues
              </span>
            )}
          </div>

          <button
            className="h-9 shrink-0 rounded-full border border-lime-300/20 px-3 text-xs font-medium text-lime-200 transition hover:border-lime-300/40 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pending || !scopeChanged}
            onClick={() => pushScope()}
            type="button"
          >
            Apply
          </button>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {pending ? "Updating analytics" : "Analytics updated"}
      </span>
    </div>
  );
}
