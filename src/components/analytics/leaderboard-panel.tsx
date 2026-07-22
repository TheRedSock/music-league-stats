"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/analytics";

type Mode = "points" | "normalized";

export function LeaderboardPanel({
  rows,
}: {
  rows: DashboardData["leaderboard"];
}) {
  const [mode, setMode] = useState<Mode>("points");
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
  const chartRows = ordered.slice(0, 10).map((row) => ({
    name: row.name,
    value:
      mode === "points"
        ? row.totalPoints
        : Number((row.normalizedIndex ?? 0).toFixed(3)),
  }));
  const metricLabel =
    mode === "points" ? "Exported points" : "Average round index";

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
            onClick={() => setMode("points")}
            variant={mode === "points" ? "primary" : "ghost"}
          >
            Total
          </Button>
          <Button
            aria-pressed={mode === "normalized"}
            className="h-8 px-3"
            onClick={() => setMode("normalized")}
            variant={mode === "normalized" ? "primary" : "ghost"}
          >
            Round-adjusted
          </Button>
        </div>
      </div>

      <div
        aria-label={`${metricLabel} for the leading ${chartRows.length} players: ${chartRows
          .map((row) => `${row.name} ${row.value}`)
          .join(", ")}`}
        className="mt-7 h-72 w-full"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ bottom: 0, left: 4, right: 22, top: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              axisLine={false}
              domain={[0, "auto"]}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="name"
              tick={{ fill: "#d4d4d8", fontSize: 12 }}
              tickLine={false}
              type="category"
              width={105}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                color: "#f4f4f5",
              }}
              cursor={{ fill: "rgba(255,255,255,.035)" }}
              labelStyle={{ color: "#f4f4f5" }}
            />
            <Bar
              dataKey="value"
              fill="#bef264"
              name={metricLabel}
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ol className="mt-6 divide-y divide-white/[0.06]">
        {ordered.slice(0, 12).map((row, index) => (
          <li
            className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3"
            key={row.id}
          >
            <span className="font-mono text-xs text-zinc-600">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-100">
                {row.name}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {row.enteredRounds} entered{" "}
                {row.enteredRounds === 1 ? "round" : "rounds"}
              </p>
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
        ))}
      </ol>
    </div>
  );
}
