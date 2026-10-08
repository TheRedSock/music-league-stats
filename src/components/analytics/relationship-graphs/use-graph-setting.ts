"use client";

import { useSearchParams } from "next/navigation";

/** Native history keeps graph-only controls shareable without fetching server data again. */
export function useGraphSetting<T extends string | number | boolean | null>(key: string, fallback: T, parse: (raw: string) => T | undefined) {
  const params = useSearchParams();
  const raw = params.get(key);
  const value = raw === null ? fallback : parse(raw) ?? fallback;
  function setValue(next: T) {
    const url = new URL(window.location.href);
    if (next === fallback || next === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(next));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return [value, setValue] as const;
}

export const graphText = (raw: string) => raw.slice(0, 2048);
export const graphBoolean = (raw: string) => raw === "true" ? true : raw === "false" ? false : undefined;
export const graphMetric = (raw: string) => raw === "mutual" || raw === "alignment" ? raw : undefined;
