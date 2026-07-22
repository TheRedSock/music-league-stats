"use client";

import { Filter, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const visibleRounds = filter.leagueId
    ? options.rounds.filter((round) => round.leagueId === filter.leagueId)
    : options.rounds;

  function navigate(updates: { league?: string; round?: string }) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}${next.size ? `?${next}` : ""}`);
    });
  }

  return (
    <div
      aria-label="Analytics filters"
      className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-3 shadow-2xl shadow-black/10 sm:flex-row sm:items-end"
      role="group"
    >
      <div className="flex items-center gap-2 px-1 pb-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 sm:pb-2.5">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-lime-300" />
        ) : (
          <Filter aria-hidden="true" className="size-4 text-lime-300" />
        )}
        Scope
      </div>
      <label className="min-w-0 flex-1 text-xs font-medium text-zinc-400">
        League
        <select
          className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
          disabled={pending}
          onChange={(event) => {
            const league = event.target.value;
            const selectedRound = options.rounds.find(
              ({ id }) => id === filter.roundId,
            );
            navigate({
              league,
              round:
                selectedRound &&
                league !== "all" &&
                selectedRound.leagueId !== league
                  ? ""
                  : (filter.roundId ?? ""),
            });
          }}
          value={filter.leagueId ?? "all"}
        >
          <option value="all">All leagues</option>
          {options.leagues.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 text-xs font-medium text-zinc-400">
        Round
        <select
          className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/15"
          disabled={pending || visibleRounds.length === 0}
          onChange={(event) => navigate({ round: event.target.value })}
          value={filter.roundId ?? ""}
        >
          <option value="">All rounds</option>
          {filter.leagueId
            ? visibleRounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.ordinal}. {round.name}
                </option>
              ))
            : options.leagues.map((league) => {
                const leagueRounds = visibleRounds.filter(
                  (round) => round.leagueId === league.id,
                );
                return leagueRounds.length ? (
                  <optgroup key={league.id} label={league.name}>
                    {leagueRounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.ordinal}. {round.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
        </select>
      </label>
      <span className="sr-only" aria-live="polite">
        {pending ? "Updating analytics" : "Analytics updated"}
      </span>
    </div>
  );
}
