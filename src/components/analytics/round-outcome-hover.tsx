"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type RoundTopSong = {
  title: string;
  artist: string;
  points: number;
  roundPointShare: number | null;
};

export function RoundOutcomeHover({
  children,
  className,
  songs,
}: {
  children: ReactNode;
  className?: string;
  songs: RoundTopSong[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!songs.length) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div aria-describedby={open ? panelId : undefined}>{children}</div>
      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-[min(100%,20rem)] rounded-xl border border-white/10 bg-zinc-950 p-3 shadow-xl"
          id={panelId}
          role="tooltip"
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Top songs
          </p>
          <ol className="space-y-2">
            {songs.map((song, index) => (
              <li key={`${song.title}-${index}`}>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <span className="mr-2 font-mono text-xs text-zinc-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {song.title}
                </p>
                <p className="mt-0.5 truncate pl-7 text-xs text-zinc-500">
                  {song.artist} · {song.points} pts ·{" "}
                  {song.roundPointShare == null
                    ? "—"
                    : `${(song.roundPointShare * 100).toFixed(1)}% share`}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
