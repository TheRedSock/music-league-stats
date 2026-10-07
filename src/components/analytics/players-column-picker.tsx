"use client";

import { createTableColumnPicker } from "@/components/analytics/table-column-picker";

export const PLAYER_TABLE_COLUMN_IDS = [
  "songs", "rounds", "points-per-song", "points-per-voter", "performance",
  "appeal-spread", "percentile", "wins", "top-quartile",
] as const;
export type PlayerTableColumnId = (typeof PLAYER_TABLE_COLUMN_IDS)[number];
export const PLAYER_TABLE_COLUMN_LABELS: Record<PlayerTableColumnId, string> = {
  songs: "Songs", rounds: "Rounds", "points-per-song": "Pts / song",
  "points-per-voter": "Pts / voter", performance: "Avg round index",
  "appeal-spread": "Reach vs share spread", percentile: "Avg percentile",
  wins: "Wins", "top-quartile": "Top quartile",
};
export const DEFAULT_PLAYER_TABLE_COLUMNS: PlayerTableColumnId[] = [
  "songs", "rounds", "points-per-song", "points-per-voter", "performance", "appeal-spread", "wins",
];
const picker = createTableColumnPicker({
  ids: PLAYER_TABLE_COLUMN_IDS, labels: PLAYER_TABLE_COLUMN_LABELS,
  defaults: DEFAULT_PLAYER_TABLE_COLUMNS, storageKey: "players-table-columns-v1",
});
export const usePlayerTableColumns = picker.useColumns;
export const PlayersColumnPicker = picker.ColumnPicker;
