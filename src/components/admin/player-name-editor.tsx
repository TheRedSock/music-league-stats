"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import type { AdminPlayer } from "@/components/admin/types";
import { Button } from "@/components/ui/button";

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/20";
const labelClass = "mb-1.5 block text-xs font-medium text-zinc-300";

function matchesQuery(player: AdminPlayer, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    player.displayName,
    player.importedName,
    player.nameOverride,
    player.sourceCompetitorId,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(term));
}

export function PlayerNameEditor({ players }: { players: AdminPlayer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(players[0]?.id ?? "");
  const [override, setOverride] = useState(players[0]?.nameOverride ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const filteredPlayers = useMemo(
    () => players.filter((player) => matchesQuery(player, query)),
    [players, query],
  );
  const selectedPlayer =
    players.find((player) => player.id === selectedId) ?? null;

  function selectPlayer(id: string) {
    const player = players.find((candidate) => candidate.id === id);
    setSelectedId(id);
    setOverride(player?.nameOverride ?? "");
    setMessage(null);
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    const nextPlayers = players.filter((player) =>
      matchesQuery(player, nextQuery),
    );
    if (!nextPlayers.some((player) => player.id === selectedId)) {
      const nextPlayer = nextPlayers[0] ?? null;
      setSelectedId(nextPlayer?.id ?? "");
      setOverride(nextPlayer?.nameOverride ?? "");
      setMessage(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlayer) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/players/${selectedPlayer.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nameOverride: override }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Could not update the player name.");
      }
      setMessage({
        kind: "success",
        text: override.trim()
          ? "Player display name updated."
          : "Player display name now follows imports.",
      });
      router.refresh();
    } catch (caught) {
      setMessage({
        kind: "error",
        text:
          caught instanceof Error
            ? caught.message
            : "Could not update the player name.",
      });
    } finally {
      setPending(false);
    }
  }

  if (!players.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-400">
        Import competitors before editing player display names.
      </p>
    );
  }

  return (
    <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onSubmit={handleSubmit}>
      <div>
        <label className={labelClass} htmlFor="player-search">
          Find player
        </label>
        <input
          className={inputClass}
          id="player-search"
          maxLength={100}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search name or source ID"
          type="search"
          value={query}
        />
        <label className={`${labelClass} mt-4`} htmlFor="player-select">
          Player
        </label>
        <select
          className={inputClass}
          disabled={!filteredPlayers.length}
          id="player-select"
          onChange={(event) => selectPlayer(event.target.value)}
          value={selectedPlayer?.id ?? ""}
        >
          {filteredPlayers.length ? (
            filteredPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))
          ) : (
            <option value="">No players match</option>
          )}
        </select>
        <p className="mt-2 text-xs text-zinc-500">
          {filteredPlayers.length.toLocaleString()} of{" "}
          {players.length.toLocaleString()} players shown.
        </p>
      </div>

      <div>
        <dl className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Imported name</dt>
            <dd className="truncate text-zinc-200" title={selectedPlayer?.importedName}>
              {selectedPlayer?.importedName}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Active display</dt>
            <dd className="truncate text-zinc-200" title={selectedPlayer?.displayName}>
              {selectedPlayer?.displayName}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Leagues</dt>
            <dd className="font-mono text-zinc-200">
              {selectedPlayer?.leagueCount.toLocaleString()}
            </dd>
          </div>
        </dl>

        <label className={`${labelClass} mt-4`} htmlFor="name-override">
          Display name override
        </label>
        <input
          className={inputClass}
          id="name-override"
          maxLength={120}
          onChange={(event) => setOverride(event.target.value)}
          placeholder={selectedPlayer?.importedName}
          value={override}
        />
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Leave blank to use the latest imported name. Future CSV imports update
          the imported name, but not this override.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={pending || !selectedPlayer} size="sm" type="submit">
            {pending ? "Saving..." : "Save player name"}
          </Button>
          <Button
            disabled={pending || !override}
            onClick={() => setOverride("")}
            size="sm"
            type="button"
            variant="secondary"
          >
            Clear override
          </Button>
          {message ? (
            <p
              className={
                message.kind === "success"
                  ? "text-sm text-lime-300"
                  : "text-sm text-red-300"
              }
              role={message.kind === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
