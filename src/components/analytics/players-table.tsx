"use client";

import { PendingLink } from "@/components/analytics/pending-link";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import { PlayersColumnPicker, usePlayerTableColumns, PLAYER_TABLE_COLUMN_LABELS, type PlayerTableColumnId } from "@/components/analytics/players-column-picker";
import { ordinal } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TruncatedCell } from "@/components/ui/table";
import type { PlayerDirectoryRow } from "@/lib/analytics";
import { buildAnalyticsHref, type QueryValue } from "@/lib/analytics-url";
import { defaultPlayerSortDirection, playerPath, type PlayerSort, type SortDirection } from "@/lib/analytics-view";

function value(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}
function metric(player: PlayerDirectoryRow, column: PlayerTableColumnId): string | number {
  switch (column) {
    case "songs": return player.submissions;
    case "rounds": return player.enteredRounds;
    case "points-per-song": return value(player.pointsPerSubmission);
    case "points-per-voter": return value(player.pointsPerEligibleVoter);
    case "performance": return player.provisional || player.averageRoundIndex === null ? "—" : `${value(player.averageRoundIndex)}×`;
    case "appeal-spread": return player.appealSpread == null ? "—" : `${player.appealSpread > 0 ? "+" : ""}${player.appealSpread.toFixed(1)} pp`;
    case "percentile": return player.averageRoundPercentile === null ? "—" : ordinal(player.averageRoundPercentile);
    case "wins": return player.roundWins;
    case "top-quartile": return player.topQuartileRate === null ? "—" : `${(player.topQuartileRate * 100).toFixed(0)}%`;
  }
}
const titles: Partial<Record<PlayerTableColumnId, string>> = {
  "appeal-spread": "Positive: broader backing across voters. Negative: stronger backing from fewer voters.",
  performance: "Average support across rounds. Above 1× means more points than an even share would give.",
  "points-per-song": "Average points per submitted song.",
  "points-per-voter": "Average points per chance to vote for this player’s songs, including zeroes.",
};
export function PlayersTable({ currentParams, direction, rows, sort }: {
  currentParams: Record<string, QueryValue>; direction: SortDirection; rows: PlayerDirectoryRow[]; sort: PlayerSort;
}) {
  const { columns: savedColumns } = usePlayerTableColumns();
  const columns = sort !== "name" && sort !== "points" && !savedColumns.includes(sort) ? [...savedColumns, sort] : savedColumns;
  return (
    <div>
      <div className="overflow-x-auto">
        <Table className="table-fixed" style={{ minWidth: 340 + columns.length * 110 }}>
          <TableHeader><TableRow>
            <TableHead className="w-14"><span className="sr-only">Row number</span></TableHead>
            <SortableTableHead activeDirection={direction} activeSort={sort} className="w-52" defaultDirection="asc" params={currentParams} path="/players" sortKey="name">Player</SortableTableHead>
            <SortableTableHead activeDirection={direction} activeSort={sort} align="right" defaultDirection="desc" params={currentParams} path="/players" sortKey="points">Points</SortableTableHead>
            {columns.map(column => (
              <SortableTableHead key={column} activeDirection={direction} activeSort={sort} align="right" defaultDirection={defaultPlayerSortDirection(column)} params={currentParams} path="/players" sortKey={column} title={titles[column]}>
                {PLAYER_TABLE_COLUMN_LABELS[column]}
              </SortableTableHead>
            ))}
          </TableRow></TableHeader>
          <TableBody>{rows.map((player, index) => (
            <TableRow key={player.id}>
              <TableCell className="font-mono text-zinc-500">{index + 1}</TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <PendingLink
                    className="truncate font-medium text-zinc-100 hover:text-lime-200"
                    href={buildAnalyticsHref(
                      playerPath(player),
                      currentParams,
                      { dir: null, q: null, sort: null },
                    )}
                    pendingLabel={`Loading ${player.name}`}
                  >
                    <TruncatedCell title={player.name}>
                      {player.name}
                    </TruncatedCell>
                  </PendingLink>

                </div>
              </TableCell>

              <TableCell className="text-right font-mono text-white">{player.totalPoints.toLocaleString()}</TableCell>
              {columns.map(column => (
                <TableCell key={column} className={`text-right font-mono${column === "performance" ? " text-lime-200" : ""}`}>{metric(player, column)}</TableCell>
              ))}
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
}

export function PlayersTableControls() {
  const { columns, toggle } = usePlayerTableColumns();
  return <PlayersColumnPicker columns={columns} onToggle={toggle} />;
}
