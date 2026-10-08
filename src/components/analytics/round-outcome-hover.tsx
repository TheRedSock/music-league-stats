"use client";

import { formatPoints } from "@/lib/format";


import { type ReactNode } from "react";

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
  return (
    <div className={cn(className)}>
      {children}
      {songs.length ? <details className="mt-2 text-xs text-zinc-400"><summary className="cursor-pointer">Top three songs</summary><div className="mt-2 border-l border-white/15 pl-3">
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
                  {song.artist} · {formatPoints(song.points)} ·{" "}
                  {song.roundPointShare == null
                    ? "—"
                    : `${(song.roundPointShare * 100).toFixed(1)}% share`}
                </p>
              </li>
            ))}
          </ol>
        </div></details> : null}
    </div>
  );
}
