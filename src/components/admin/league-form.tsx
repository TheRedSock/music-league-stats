"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminLeague } from "@/components/admin/types";
import { Button } from "@/components/ui/button";

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/20";
const labelClass = "mb-1.5 block text-xs font-medium text-zinc-300";

export function LeagueForm({ league }: { league?: AdminLeague }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(null);
    const body = {
      name: form.get("name"),
      musicLeagueId: form.get("musicLeagueId"),
      slug: form.get("slug"),
      totalRounds: Number(form.get("totalRounds")),
      maxPlayers: Number(form.get("maxPlayers")),
      songsPerPlayerPerRound: Number(form.get("songsPerPlayerPerRound")),
      status: form.get("status"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
    };
    try {
      const response = await fetch(
        league ? `/api/admin/leagues/${league.id}` : "/api/admin/leagues",
        {
          method: league ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Could not save the league.");
      }
      setMessage({
        kind: "success",
        text: league ? "League updated." : "League created.",
      });
      if (!league) formElement.reset();
      router.refresh();
    } catch (caught) {
      setMessage({
        kind: "error",
        text:
          caught instanceof Error
            ? caught.message
            : "Could not save the league.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor={`name-${league?.id ?? "new"}`}>
          Name
        </label>
        <input
          className={inputClass}
          defaultValue={league?.name}
          id={`name-${league?.id ?? "new"}`}
          maxLength={120}
          name="name"
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor={`slug-${league?.id ?? "new"}`}>
          Slug
        </label>
        <input
          className={inputClass}
          defaultValue={league?.slug}
          id={`slug-${league?.id ?? "new"}`}
          maxLength={80}
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="spring-2026"
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label
          className={labelClass}
          htmlFor={`music-league-id-${league?.id ?? "new"}`}
        >
          Music League ID
        </label>
        <input
          className={inputClass}
          defaultValue={league?.musicLeagueId ?? ""}
          id={`music-league-id-${league?.id ?? "new"}`}
          maxLength={120}
          name="musicLeagueId"
          pattern="[A-Za-z0-9_-]+"
          placeholder="ID from https://app.musicleague.com/l/..."
        />
      </div>
      {[
        ["totalRounds", "Total rounds", league?.totalRounds],
        ["maxPlayers", "Maximum players", league?.maxPlayers],
        [
          "songsPerPlayerPerRound",
          "Songs per player / round",
          league?.songsPerPlayerPerRound,
        ],
      ].map(([name, label, value]) => (
        <div key={String(name)}>
          <label
            className={labelClass}
            htmlFor={`${String(name)}-${league?.id ?? "new"}`}
          >
            {label}
          </label>
          <input
            className={inputClass}
            defaultValue={value}
            id={`${String(name)}-${league?.id ?? "new"}`}
            min={1}
            name={String(name)}
            required
            type="number"
          />
        </div>
      ))}
      <div>
        <label className={labelClass} htmlFor={`status-${league?.id ?? "new"}`}>
          Status
        </label>
        <select
          className={inputClass}
          defaultValue={league?.status ?? "active"}
          id={`status-${league?.id ?? "new"}`}
          name="status"
        >
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`start-${league?.id ?? "new"}`}>
          Start date
        </label>
        <input
          className={inputClass}
          defaultValue={league?.startDate ?? ""}
          id={`start-${league?.id ?? "new"}`}
          name="startDate"
          type="date"
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`end-${league?.id ?? "new"}`}>
          End date
        </label>
        <input
          className={inputClass}
          defaultValue={league?.endDate ?? ""}
          id={`end-${league?.id ?? "new"}`}
          name="endDate"
          type="date"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={pending} size="sm" type="submit">
          {pending
            ? "Saving…"
            : league
              ? "Save changes"
              : "Create league"}
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
    </form>
  );
}
