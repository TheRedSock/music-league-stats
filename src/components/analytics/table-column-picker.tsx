"use client";

import { Columns3 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Popover } from "@/components/ui/popover";

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
    return (
      <Popover label="Table columns" trigger={<><Columns3 aria-hidden="true" className="size-4" />Columns</>}>
        <p className="mb-2 text-sm font-medium">Show columns</p>
        <ul className="space-y-1">
          {ids.map((column) => (
            <li key={column}>
              <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-white/5">
                <input checked={columns.includes(column)}
                  disabled={columns.length === 1 && columns.includes(column)}
                  className="size-4 accent-lime-300"
                  onChange={() => onToggle(column)} type="checkbox" />
                <span>{labels[column]}</span>
              </label>
            </li>
          ))}
        </ul>
      </Popover>
    );
  }

  return { useColumns, ColumnPicker };
}
