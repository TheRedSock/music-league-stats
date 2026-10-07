"use client";

import { Columns3 } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Each table owns a stable external store and independent saved preferences. */
export function createTableColumnPicker<Id extends string>({
  ids, labels, defaults, storageKey, legacyKey, migrate,
}: {
  ids: readonly Id[];
  labels: Record<Id, string>;
  defaults: Id[];
  storageKey: string;
  legacyKey?: string;
  migrate?: (columns: Id[]) => Id[];
}) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedColumns = defaults;

  function parse(raw: string | null): Id[] | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const columns = ids.filter(id => parsed.includes(id));
      return columns.length ? columns : null;
    } catch { return null; }
  }

  function readColumns(): Id[] {
    if (typeof window === "undefined") return defaults;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === cachedRaw) return cachedColumns;
    cachedRaw = raw;
    const legacy = raw === null && legacyKey ? parse(window.localStorage.getItem(legacyKey)) : null;
    cachedColumns = parse(raw) ?? (legacy ? migrate?.(legacy) ?? legacy : defaults);
    return cachedColumns;
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === legacyKey || event.key === null) {
        cachedRaw = undefined;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
  }
  function useColumns() {
    const columns = useSyncExternalStore(subscribe, readColumns, () => defaults);
    function toggle(column: Id) {
      const current = readColumns();
      if (current.includes(column) && current.length === 1) return;
      const next = current.includes(column) ? current.filter(id => id !== column)
        : ids.filter(id => id === column || current.includes(id));
      cachedRaw = JSON.stringify(next);
      cachedColumns = next;
      window.localStorage.setItem(storageKey, cachedRaw);
      for (const listener of listeners) listener();
    }
    return { columns, toggle, isVisible: (column: Id) => columns.includes(column) };
  }
  function ColumnPicker({ columns, onToggle }: { columns: readonly Id[]; onToggle: (column: Id) => void }) {
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
                {ids.map((column) => {
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
                        <span>{labels[column]}</span>
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

  return { useColumns, ColumnPicker };
}
