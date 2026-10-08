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
export const DEFAULT_SONG_TABLE_COLUMNS: SongTableColumnId[] = ["support-eb"];
const oldDefaults = [["positive-reach"], ["positive-reach", "points-per-voter", "round-share", "support-eb", "appeal-spread"]];
const picker = createTableColumnPicker({
  ids: SONG_TABLE_COLUMN_IDS,
  labels: SONG_TABLE_COLUMN_LABELS,
  defaults: DEFAULT_SONG_TABLE_COLUMNS,
  storageKey: "songs-table-columns-v4",
  legacyKey: ["songs-table-columns-v3", "songs-table-columns-v2"],
  migrate: columns => oldDefaults.some(defaults => columns.length === defaults.length && defaults.every(id => columns.includes(id as SongTableColumnId)))
    ? DEFAULT_SONG_TABLE_COLUMNS : columns,
});
export const useSongTableColumns = picker.useColumns;
export const SongsColumnPicker = picker.ColumnPicker;

export function SongsTableControls() {
  const { columns, toggle } = useSongTableColumns();
  return <SongsColumnPicker columns={columns} onToggle={toggle} />;
}
