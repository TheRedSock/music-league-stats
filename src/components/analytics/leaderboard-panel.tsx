"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildAnalyticsHref,
  type DashboardData,
  type QueryValue,
} from "@/lib/analytics";

type Mode = "points" | "normalized";

const PAGE_SIZE = 10;

export function LeaderboardPanel({
  filterParams = {},
  rows,
}: {
  filterParams?: Record<string, QueryValue>;
  rows: DashboardData["leaderboard"];
}) {
  const [mode, setMode] = useState<Mode>("points");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const normalizedMinimum = rows.some((row) => row.enteredRounds >= 3) ? 3 : 1;
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
    mode === "points" ? "Exported points" : "Average round index";

  function switchMode(next: Mode) {
    setMode(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Player leaderboard
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            Raw points reward volume. The round index compares each
            player&apos;s points with the expected points for their submitted songs
            from that round&apos;s eligible ballot budgets. Ratio rankings require
            three entered rounds when the selected scope contains enough history.
          </p>
        </div>
        <div
          aria-label="Leaderboard metric"
          className="flex rounded-full border border-white/10 bg-black/20 p-1"
          role="group"
        >
          <Button
            aria-pressed={mode === "points"}
            className="h-8 px-3"
            onClick={() => switchMode("points")}
            variant={mode === "points" ? "primary" : "ghost"}
          >
            Total
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

      <ol
        aria-label={`${metricLabel} leaderboard`}
        className="mt-7 divide-y divide-white/[0.06]"
      >
        {visible.map((row, index) => {
          const value =
            mode === "points" ? row.totalPoints : (row.normalizedIndex ?? 0);
          const widthPercent =
            scaleMax > 0 ? Math.max(2, (value / scaleMax) * 100) : 0;
          return (
            <li
              className="grid grid-cols-[2rem_minmax(6.5rem,10.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 py-3 sm:grid-cols-[2rem_minmax(8rem,12rem)_minmax(0,1fr)_5rem] sm:gap-4"
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
                      `/players/${row.id}`,
                      filterParams,
                      {},
                    )}
                  >
                    {row.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.enteredRounds} entered{" "}
                  {row.enteredRounds === 1 ? "round" : "rounds"}
                </p>
              </div>
              <div
                aria-hidden="true"
                className="h-2.5 overflow-hidden rounded-full bg-white/[0.06] sm:h-3"
                title={`${row.name}: ${
                  mode === "points"
                    ? row.totalPoints.toLocaleString()
                    : row.normalizedIndex?.toFixed(2) ?? "—"
                }`}
              >
                <div
                  className="h-full rounded-full bg-lime-300/85 transition-[width] duration-300"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-white">
                  {mode === "points"
                    ? row.totalPoints.toLocaleString()
                    : row.normalizedIndex?.toFixed(2) ?? "—"}
                </p>
                {mode === "normalized" && row.normalizedIndex !== null ? (
                  <Badge className="mt-1" variant="muted">
                    1.0 avg
                  </Badge>
                ) : null}
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
