"use client";

import { createTableColumnPicker } from "@/components/analytics/table-column-picker";

export const SONG_TABLE_COLUMN_IDS = [
  "positive-reach", "points-per-voter", "points-per-actual-voter", "round-share",
  "support-eb", "appeal-spread", "support-z", "normalized-index", "percentile",
] as const;
export type SongTableColumnId = (typeof SONG_TABLE_COLUMN_IDS)[number];
export const SONG_TABLE_COLUMN_LABELS: Record<SongTableColumnId, string> = {
  "positive-reach": "Voters reached",
  "points-per-voter": "Pts / voter",
  "points-per-actual-voter": "Avg pts / actual voter",
  "round-share": "Round share",
  "support-eb": "Adjusted support",
  "appeal-spread": "Reach vs share spread",
  "support-z": "Statistical surprise",
  "normalized-index": "Support index (raw)",
  percentile: "Round percentile",
};
export const DEFAULT_SONG_TABLE_COLUMNS: SongTableColumnId[] = ["positive-reach"];
const oldDefaults = ["positive-reach", "points-per-voter", "round-share", "support-eb", "appeal-spread"];
const picker = createTableColumnPicker({
  ids: SONG_TABLE_COLUMN_IDS,
  labels: SONG_TABLE_COLUMN_LABELS,
  defaults: DEFAULT_SONG_TABLE_COLUMNS,
  storageKey: "songs-table-columns-v3",
  legacyKey: "songs-table-columns-v2",
  migrate: columns => columns.length === oldDefaults.length && oldDefaults.every(id => columns.includes(id as SongTableColumnId))
    ? DEFAULT_SONG_TABLE_COLUMNS : columns,
});
export const useSongTableColumns = picker.useColumns;
export const SongsColumnPicker = picker.ColumnPicker;
