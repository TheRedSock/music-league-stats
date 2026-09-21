"use client";

import { tableColumnHelp } from "@/lib/table-help";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea } from "recharts";
import { Button } from "@/components/ui/button";
import { buildProgression, progressionPointTicks, progressionTopPlayerIds, type ProgressionRow } from "@/lib/score-progression";
import type { LeagueOption } from "@/lib/analytics";
import { GraphEmptyState } from "./graphs-controls";

const colors = ["#bef264", "#38bdf8", "#fb923c", "#c084fc", "#f472b6", "#2dd4bf", "#facc15", "#a5b4fc"];
const modes = { total: "Cumulative points", rank: "Standing", points: "Round points" } as const;
type Mode = keyof typeof modes;

export function ProgressionView({ rows, leagues, subset }: { rows: ProgressionRow[]; leagues: LeagueOption[]; subset: boolean }) {
  const availableLeagues = leagues.filter((league) => rows.some((row) => row.leagueId === league.id))
    .sort((a, b) => (a.chronologicalOrder ?? Infinity) - (b.chronologicalOrder ?? Infinity));
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<Mode>("total");
  const [focus, setFocus] = useState("");
  const [topLimit, setTopLimit] = useState<number | null>(null);
  const leagueId = availableLeagues.some(({ id }) => id === selected) ? selected : availableLeagues[0]?.id;
  const leagueRows = rows.filter((row) => row.leagueId === leagueId);
  if (!rows.length) return <GraphEmptyState message="No scored rounds in this scope yet. Progression appears once votes have been imported." />;
  return <div className="space-y-4">
    {availableLeagues.length > 1 && <select aria-label="League" className="block w-full max-w-md truncate rounded-lg border border-white/10 bg-zinc-950 p-2 text-sm text-zinc-100" value={leagueId} onChange={(event) => {
      const nextLeague = event.target.value;
      setSelected(nextLeague);
      if (!rows.some((row) => row.leagueId === nextLeague && row.playerId === focus)) setFocus("");
    }}>
      {availableLeagues.map(({ id, slug, name }) => <option key={id} value={id} title={`${slug} - ${name}`}>{slug} - {name.length > 42 ? `${name.slice(0, 41).trimEnd()}…` : name}</option>)}
    </select>}
    <LeagueProgression key={`${leagueId}:${rows.map((row) => row.roundId).join(",")}`} rows={leagueRows} subset={subset} mode={mode} setMode={setMode} selectedFocus={focus} setFocus={setFocus} topLimit={topLimit} setTopLimit={setTopLimit} />
  </div>;
}

function LeagueProgression({ rows, subset, mode, setMode, selectedFocus, setFocus, topLimit, setTopLimit }: {
  rows: ProgressionRow[];
  subset: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  selectedFocus: string;
  setFocus: (id: string) => void;
  topLimit: number | null;
  setTopLimit: (limit: number | null) => void;
}) {
  const { players, timeline } = useMemo(() => buildProgression(rows), [rows]);
  const visibleIds = progressionTopPlayerIds(timeline[timeline.length - 1].standings, topLimit);
  const visiblePlayers = players.filter((player) => visibleIds.has(player.id));
  const focus = visibleIds.has(selectedFocus) ? selectedFocus : "";
  const playerColor = (id: string) => colors[players.findIndex((player) => player.id === id) % colors.length];
  const maximum = timeline.reduce((max, round) => round.values.reduce((value, player) => visibleIds.has(player.id) ? Math.max(value, player[mode]) : value, max), 0);
  const pointTicks = progressionPointTicks(maximum);
  const [roundIndex, setRoundIndex] = useState(timeline.length - 1);
  const current = timeline[roundIndex];
  const chartRows = timeline.map((round) => ({
    label: `R${round.ordinal}`,
    ...Object.fromEntries(round.values.map((player) => [player.id, player[mode]])),
  }));
  const split = Math.ceil(timeline.length / 2);
  const average = (id: string, start: number, end: number) => {
    const rounds = timeline.slice(start, end);
    return rounds.length ? (rounds.reduce((sum, round) => sum + round.values.find((p) => p.id === id)!.points, 0) / rounds.length).toFixed(1) : "—";
  };
  return <section className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-white">{rows[0].leagueName}</h2>
        <p className="mt-1 text-sm text-zinc-400">{timeline.length} scored rounds · {players.length} players</p></div>
      <div role="group" aria-label="Progression metric" className="flex flex-wrap gap-1">
        {(Object.keys(modes) as Mode[]).map((key) => <Button key={key} size="sm" variant={mode === key ? "primary" : "ghost"} aria-pressed={mode === key} onClick={() => setMode(key)}>{modes[key]}</Button>)}
      </div>
    </div>
    <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-400">Show
      <select aria-label="Top players by final standing" className="rounded-lg border border-white/10 bg-zinc-950 p-2 text-zinc-100" value={topLimit ?? "all"} onChange={(event) => setTopLimit(event.target.value === "all" ? null : Number(event.target.value))}>
        <option value="all">All players</option>
        {Array.from({ length: Math.max(players.length, topLimit ?? 0) }, (_, index) => index + 1).map((limit) => <option key={limit} value={limit}>Top {limit}</option>)}
      </select>
      <span className="text-xs">By final standing in this timeline · includes ties · showing {visiblePlayers.length}</span>
    </label>
    <p className="mt-4 text-xs leading-5 text-zinc-500">
      {subset ? "Totals restart at zero for the selected rounds. " : "Totals accumulate in league round order. "}
      Only rounds with exported votes are shown; imported results may be partial. Missed rounds add zero, and tied totals share a standing. Highlight a player to follow their line.
    </p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Highlight player">
      <Button size="sm" variant={focus === "" ? "primary" : "ghost"} aria-pressed={!focus} onClick={() => setFocus("")}>All players</Button>
      {visiblePlayers.map((player) => <button key={player.id} type="button" aria-pressed={focus === player.id} onClick={() => setFocus(focus === player.id ? "" : player.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-lime-300" style={{ color: playerColor(player.id), opacity: focus && focus !== player.id ? 0.5 : 1 }}>{player.name}</button>)}
    </div>
    <div className="mt-6 h-[380px] w-full" role="group" aria-label={`${modes[mode]} by round. Use the round selector below for exact standings and scores.`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows} margin={{ top: 12, right: 18, bottom: 12, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis width={45} stroke="#a1a1aa" tick={{ fontSize: 12 }} allowDecimals={false} reversed={mode === "rank"} domain={mode === "rank" ? [1, Math.max(2, maximum)] : [0, pointTicks[4]]} ticks={mode === "rank" ? undefined : pointTicks} />
          <ReferenceLine x={`R${current.ordinal}`} stroke="#71717a" strokeDasharray="4 4" />
          <Tooltip content={({ active, label, coordinate }) => {
            const round = timeline.find((item) => `R${item.ordinal}` === label);
            if (!active || !round) return null;
            return <ProgressionTooltip round={round} mode={mode} mouseY={coordinate?.y} maximum={mode === "rank" ? Math.max(2, maximum) : pointTicks[4]} visibleIds={visibleIds} playerColor={playerColor} />;
          }} />
          {players.map((player, index) => visibleIds.has(player.id) && <Line key={player.id} dataKey={player.id} name={player.name} type="linear" stroke={playerColor(player.id)} strokeWidth={focus === player.id ? 3.5 : 2} strokeOpacity={focus && focus !== player.id ? 0.15 : 1} strokeDasharray={index >= colors.length ? `${3 + Math.floor(index / colors.length) * 2} 3` : undefined} dot={timeline.length === 1 || focus === player.id ? { r: 3 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <label className="mt-4 block text-sm text-zinc-300">Standings after
      <select className="mt-2 block w-full max-w-xl rounded-lg border border-white/10 bg-zinc-950 p-2" value={roundIndex} onChange={(event) => setRoundIndex(Number(event.target.value))}>
        {timeline.map((round, index) => <option key={round.id} value={index}>R{round.ordinal} · {round.name}</option>)}
      </select>
    </label>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">Standings after round {current.ordinal}. Early and late averages cover the entire displayed timeline.</caption>
        <thead className="text-xs text-zinc-500"><tr>{["Rank", "Player", "Total", "This round", "Early avg", "Late avg"].map((label) => <th key={label} title={tableColumnHelp(label)} scope="col" className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{current.standings.filter((player) => visibleIds.has(player.id)).map((player) => <tr key={player.id} className={`border-t border-white/5 ${focus === player.id ? "bg-lime-300/10 text-lime-100" : "text-zinc-300"}`}>
          <td className="px-3 py-2">{player.rank}</td><th scope="row" className="px-3 py-2 font-medium">{player.name}</th><td className="px-3 py-2">{player.total}</td><td className="px-3 py-2">{player.entered ? player.points : "—"}</td><td className="px-3 py-2">{average(player.id, 0, split)}</td><td className="px-3 py-2">{average(player.id, split, timeline.length)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs leading-5 text-zinc-500">Early / late averages are points per round across the first {split} and last {timeline.length - split} displayed rounds, including missed rounds as zero. For odd round counts, the middle round belongs to the early half. Raw points reflect each round’s voting budget; these are not normalized performance scores.</p>
  </section>;
}

function ProgressionTooltip({ round, mode, mouseY, maximum, visibleIds, playerColor }: {
  round: ReturnType<typeof buildProgression>["timeline"][number];
  mode: Mode;
  mouseY: number | undefined;
  maximum: number;
  visibleIds: Set<string>;
  playerColor: (id: string) => string;
}) {
  const plot = usePlotArea();
  const players = round.standings.filter((player) => visibleIds.has(player.id));
  const fraction = plot && mouseY !== undefined ? (mouseY - plot.y) / plot.height : null;
  const hoveredValue = fraction === null ? null : mode === "rank"
    ? 1 + fraction * (maximum - 1) : (1 - fraction) * maximum;
  const distance = hoveredValue === null ? Infinity : Math.min(...players.map((player) => Math.abs(player[mode] - hoveredValue)));
  const nearest = hoveredValue === null ? [] : players.filter((player) => Math.abs(Math.abs(player[mode] - hoveredValue) - distance) < 0.000001);
  const nearestIds = new Set(nearest.map((player) => player.id));
  const valueLabel = (value: number) => mode === "rank" ? `#${value}` : `${value} pts`;
  return <div className="max-w-xs rounded-xl border border-white/10 bg-zinc-950 p-3 text-xs text-zinc-200 shadow-xl">
    <p className="mb-2 font-semibold">R{round.ordinal} · {round.name}</p>
    {nearest.length > 0 && <div className="mb-2 border-b border-white/10 pb-2">
      <p className="mb-1 text-zinc-400">Nearest to pointer · {modes[mode]}</p>
      {nearest.map((player) => <p key={player.id} className="font-semibold" style={{ color: playerColor(player.id) }}>{player.name}: {valueLabel(player[mode])}</p>)}
    </div>}
    <div className="max-h-60 overflow-auto">
      {players.map((player) => <p key={player.id} className={nearestIds.has(player.id) ? "rounded bg-white/10 px-1 font-semibold" : "px-1"}>
        <span style={{ color: playerColor(player.id) }}>● </span>{player.rank}. {player.name}: {player.total} pts · {player.points} this round{!player.entered ? " (no scored submission)" : ""}
      </p>)}
    </div>
  </div>;
}
