"use client";

import { Columns3 } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SONG_TABLE_COLUMN_IDS = [
  "positive-reach",
  "points-per-voter",
  "round-share",
  "support-eb",
  "support-z",
  "normalized-index",
  "percentile",
] as const;

export type SongTableColumnId = (typeof SONG_TABLE_COLUMN_IDS)[number];

export const SONG_TABLE_COLUMN_LABELS: Record<SongTableColumnId, string> = {
  "positive-reach": "Positive reach",
  "points-per-voter": "Pts / voter",
  "round-share": "Round share",
  "support-eb": "Support index (EB)",
  "support-z": "Support z",
  "normalized-index": "Support index (raw)",
  percentile: "Round percentile",
};

export const DEFAULT_SONG_TABLE_COLUMNS: SongTableColumnId[] = [
  "positive-reach",
  "points-per-voter",
  "round-share",
  "support-eb",
  "support-z",
];

const STORAGE_KEY = "songs-table-columns-v1";

const listeners = new Set<() => void>();

/** Cached snapshot so useSyncExternalStore gets a stable reference until storage changes. */
let cachedRaw: string | null | undefined;
let cachedColumns: SongTableColumnId[] = DEFAULT_SONG_TABLE_COLUMNS;

function emitColumnChange() {
  for (const listener of listeners) listener();
}

function isSongTableColumnId(value: string): value is SongTableColumnId {
  return (SONG_TABLE_COLUMN_IDS as readonly string[]).includes(value);
}

function parseStoredColumns(raw: string | null): SongTableColumnId[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const columns = parsed.filter(
      (value): value is SongTableColumnId =>
        typeof value === "string" && isSongTableColumnId(value),
    );
    return columns.length ? columns : null;
  } catch {
    return null;
  }
}

function readColumns(): SongTableColumnId[] {
  if (typeof window === "undefined") return DEFAULT_SONG_TABLE_COLUMNS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedColumns;
  cachedRaw = raw;
  cachedColumns = parseStoredColumns(raw) ?? DEFAULT_SONG_TABLE_COLUMNS;
  return cachedColumns;
}

function getServerSnapshot(): SongTableColumnId[] {
  return DEFAULT_SONG_TABLE_COLUMNS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeColumns(columns: SongTableColumnId[]) {
  const raw = JSON.stringify(columns);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedColumns = columns;
  emitColumnChange();
}

export function useSongTableColumns() {
  const columns = useSyncExternalStore(subscribe, readColumns, getServerSnapshot);

  function toggle(column: SongTableColumnId) {
    const current = readColumns();
    if (current.includes(column)) {
      if (current.length === 1) return;
      writeColumns(current.filter((id) => id !== column));
      return;
    }
    writeColumns(
      SONG_TABLE_COLUMN_IDS.filter(
        (id) => id === column || current.includes(id),
      ),
    );
  }

  function isVisible(column: SongTableColumnId) {
    return columns.includes(column);
  }

  return { columns, isVisible, toggle };
}

export function SongsColumnPicker({
  columns,
  onToggle,
}: {
  columns: readonly SongTableColumnId[];
  onToggle: (column: SongTableColumnId) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="relative">
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        className={buttonStyles({ variant: "secondary" })}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Columns3 aria-hidden="true" className="size-4" />
        Columns
      </button>
      {open ? (
        <>
          <button
            aria-label="Close columns menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-xl"
            id={menuId}
            role="menu"
          >
            <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Toggle metric columns
            </p>
            <ul className="space-y-0.5">
              {SONG_TABLE_COLUMN_IDS.map((column) => {
                const checked = columns.includes(column);
                return (
                  <li key={column}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.04]",
                      )}
                    >
                      <input
                        checked={checked}
                        className="size-3.5 rounded border-white/20 bg-zinc-900 text-lime-300 focus:ring-lime-300/30"
                        onChange={() => onToggle(column)}
                        type="checkbox"
                      />
                      <span>{SONG_TABLE_COLUMN_LABELS[column]}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
