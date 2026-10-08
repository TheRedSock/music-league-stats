"use client";

import { qualificationRoundFloor } from "@/lib/participation";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { playerPath } from "@/lib/player-slug";
import { buildAnalyticsHref, type QueryValue } from "@/lib/analytics-url";

type LeaderboardRow = {
  id: string;
  slug: string;
  name: string;
  totalPoints: number;
  normalizedIndex: number | null;
  enteredRounds: number;
};

type Mode = "points" | "normalized";

const PAGE_SIZE = 5;

export function LeaderboardPanel({
  filterParams = {},
  rows,
  scopeRounds,
  totalRounds,
}: {
  filterParams?: Record<string, QueryValue>;
  rows: LeaderboardRow[];
  scopeRounds: number;
  totalRounds: number;
}) {
  const [mode, setMode] = useState<Mode>("points");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const normalizedMinimum = qualificationRoundFloor(scopeRounds, totalRounds);
  const ordered = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            mode === "points" || row.enteredRounds >= normalizedMinimum,
        )
        .sort((left, right) =>
          mode === "points"
            ? right.totalPoints - left.totalPoints
            : (right.normalizedIndex ?? -1) - (left.normalizedIndex ?? -1),
        ),
    [mode, normalizedMinimum, rows],
  );

  const visible = ordered.slice(0, visibleCount);
  // Scale bars against the full ordered list leader so expanding doesn't shrink top bars.
  const scaleMax = ordered.reduce((max, row) => {
    const value =
      mode === "points" ? row.totalPoints : (row.normalizedIndex ?? 0);
    return Math.max(max, value);
  }, 0);

  const metricLabel =
    mode === "points" ? "Points" : "Average round index";

  function switchMode(next: Mode) {
    setMode(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Players
          </h2>
          <p className="mt-1 text-xs text-zinc-400">{mode === "points" ? "Total points across the selected leagues" : `Average round index · at least ${normalizedMinimum} of ${scopeRounds} rounds`}</p>
        </div>
        <div
          aria-label="Leaderboard metric"
          className="flex rounded-md border border-white/10 p-1"
          role="group"
        >
          <Button
            aria-pressed={mode === "points"}
            className="h-8 px-3"
            onClick={() => switchMode("points")}
            variant={mode === "points" ? "primary" : "ghost"}
          >
            Points
          </Button>
          <Button
            aria-pressed={mode === "normalized"}
            className="h-8 px-3"
            onClick={() => switchMode("normalized")}
            variant={mode === "normalized" ? "primary" : "ghost"}
          >
            Round-adjusted
          </Button>
        </div>
      </div>

      {mode === "normalized" ? <p className="mt-3 text-xs text-zinc-400">1.0 is the expected score for the round. <Link href="/faq#rankings" className="underline underline-offset-4">How rankings work</Link></p> : null}
      <ol
        aria-label={`${metricLabel} leaderboard`}
        className="mt-4 divide-y divide-white/[0.06]"
      >
        {visible.map((row, index) => {
          const value =
            mode === "points" ? row.totalPoints : (row.normalizedIndex ?? 0);
          const widthPercent =
            scaleMax > 0 ? Math.max(2, (value / scaleMax) * 100) : 0;
          return (
            <li
              className="grid grid-cols-[1.25rem_7rem_minmax(0,1fr)_3.5rem] items-center gap-2 py-3 sm:grid-cols-[2rem_minmax(8rem,12rem)_minmax(0,1fr)_5rem] sm:gap-4"
              key={row.id}
            >
              <span className="font-mono text-xs text-zinc-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  <Link
                    className="hover:text-lime-200"
                    href={buildAnalyticsHref(
                      playerPath(row),
                      filterParams,
                      {},
                    )}
                  >
                    {row.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.enteredRounds}{" "}
                  {row.enteredRounds === 1 ? "round" : "rounds"}
                </p>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-sm bg-white/[0.06] sm:h-2"
                title={`${row.name}: ${
                  mode === "points"
                    ? row.totalPoints.toLocaleString()
                    : row.normalizedIndex?.toFixed(2) ?? "—"
                }`}
              >
                <div
                  className="h-full rounded-sm bg-lime-300/85 transition-[width] duration-300"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-white">
                  {mode === "points"
                    ? row.totalPoints.toLocaleString()
                    : row.normalizedIndex?.toFixed(2) ?? "—"}
                </p>

              </div>
            </li>
          );
        })}
      </ol>

      {visibleCount < ordered.length ? (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + PAGE_SIZE, ordered.length),
              )
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            Show more
            <span className="font-mono text-[10px] text-zinc-500">
              {Math.min(PAGE_SIZE, ordered.length - visibleCount)} more
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
