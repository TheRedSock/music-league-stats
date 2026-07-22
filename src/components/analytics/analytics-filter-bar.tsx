"use client";

import { Filter, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  AnalyticsFilter,
  FilterOptions,
} from "@/lib/analytics";

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
      key={`${filter.leagueIds.join(",")}:${filter.roundIds.join(",")}`}
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
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [leagueIds, setLeagueIds] = useState(filter.leagueIds);
  const [roundIds, setRoundIds] = useState(filter.roundIds);
  const visibleRounds = useMemo(
    () =>
      leagueIds.length
        ? options.rounds.filter((round) => leagueIds.includes(round.leagueId))
        : options.rounds,
    [leagueIds, options.rounds],
  );

  function toggleLeague(id: string) {
    setLeagueIds((current) => {
      const next = current.includes(id)
        ? current.filter((leagueId) => leagueId !== id)
        : [...current, id].sort();
      if (next.length) {
        setRoundIds((rounds) =>
          rounds.filter((roundId) =>
            options.rounds.some(
              (round) => round.id === roundId && next.includes(round.leagueId),
            ),
          ),
        );
      }
      return next;
    });
  }

  function toggleRound(id: string) {
    setRoundIds((current) =>
      current.includes(id)
        ? current.filter((roundId) => roundId !== id)
        : [...current, id].sort(),
    );
  }

  function applyScope() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("league");
    next.delete("round");
    if (leagueIds.length) {
      for (const leagueId of leagueIds) next.append("league", leagueId);
    } else {
      next.set("league", "all");
    }
    for (const roundId of roundIds) next.append("round", roundId);
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}${next.size ? `?${next}` : ""}`);
    });
  }

  const scopeChanged =
    leagueIds.join(",") !== filter.leagueIds.join(",") ||
    roundIds.join(",") !== filter.roundIds.join(",");

  return (
    <div
      aria-label="Analytics filters"
      className="rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-3 shadow-2xl shadow-black/10"
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
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
        <button
          className="rounded-full border border-lime-300/20 px-3 py-1 text-xs font-medium text-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !scopeChanged}
          onClick={applyScope}
          type="button"
        >
          Apply
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <fieldset className="min-w-0 rounded-xl border border-white/10 bg-black/15 p-3">
          <legend className="px-1 text-xs font-medium text-zinc-400">
            Leagues
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-lime-300/40 hover:text-lime-200"
              onClick={() => {
                setLeagueIds([]);
                setRoundIds([]);
              }}
              type="button"
            >
              All leagues
            </button>
            {options.leagues.map((league) => (
              <label
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 has-[:checked]:border-lime-300/40 has-[:checked]:text-lime-200"
                key={league.id}
              >
                <input
                  checked={leagueIds.includes(league.id)}
                  className="size-3 accent-lime-300"
                  onChange={() => toggleLeague(league.id)}
                  type="checkbox"
                />
                <span>{league.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 rounded-xl border border-white/10 bg-black/15 p-3">
          <legend className="px-1 text-xs font-medium text-zinc-400">
            Rounds
          </legend>
          <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
            <button
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-lime-300/40 hover:text-lime-200"
              onClick={() => setRoundIds([])}
              type="button"
            >
              All visible rounds
            </button>
            {options.leagues.map((league) => {
              const leagueRounds = visibleRounds.filter(
                (round) => round.leagueId === league.id,
              );
              return leagueRounds.length ? (
                <div key={league.id}>
                  <p className="mb-1 text-[11px] font-medium text-zinc-600">
                    {league.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {leagueRounds.map((round) => (
                      <label
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 has-[:checked]:border-lime-300/40 has-[:checked]:text-lime-200"
                        key={round.id}
                      >
                        <input
                          checked={roundIds.includes(round.id)}
                          className="size-3 accent-lime-300"
                          onChange={() => toggleRound(round.id)}
                          type="checkbox"
                        />
                        <span>
                          {round.ordinal}. {round.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </fieldset>
      </div>
      <span className="sr-only" aria-live="polite">
        {pending ? "Updating analytics" : "Analytics updated"}
      </span>
    </div>
  );
}
