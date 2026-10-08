"use client";

import { PendingLink } from "@/components/analytics/pending-link";
import { SortableTableHead } from "@/components/analytics/sortable-table-head";
import { PlayersColumnPicker, usePlayerTableColumns, PLAYER_TABLE_COLUMN_LABELS, type PlayerTableColumnId } from "@/components/analytics/players-column-picker";
import { ordinal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
  "appeal-spread": "Percentile of average reach minus percentile of average round share among qualified players in this scope, in percentage points. At least 3 songs, each with 5 eligible voters, and the adaptive minimum rounds. Positive = crowd pleaser; negative = niche devotion.",
  performance: "Average of round-local actual points divided by expected points from eligible ballot budgets.",
  "points-per-song": "Eligible points received divided by submitted songs.",
  "points-per-voter": "Eligible points received divided by eligible vote opportunities.",
};
export function PlayersTable({ currentParams, direction, rows, sort }: {
  currentParams: Record<string, QueryValue>; direction: SortDirection; rows: PlayerDirectoryRow[]; sort: PlayerSort;
}) {
  const { columns, toggle } = usePlayerTableColumns();
  return (
    <div>
      <div className="flex justify-end px-4 py-3 sm:px-5"><PlayersColumnPicker columns={columns} onToggle={toggle} /></div>
      <div className="overflow-x-auto border-t border-white/[0.06]">
        <Table className="table-fixed" style={{ minWidth: 340 + columns.length * 110 }}>
          <TableHeader><TableRow>
            <TableHead className="w-24" title="Rank by average round index among qualified players, regardless of the table sort.">Adjusted rank</TableHead>
            <SortableTableHead activeDirection={direction} activeSort={sort} className="w-[20%]" defaultDirection="asc" params={currentParams} path="/players" sortKey="name">Player</SortableTableHead>
            <SortableTableHead activeDirection={direction} activeSort={sort} align="right" defaultDirection="desc" params={currentParams} path="/players" sortKey="points">Points</SortableTableHead>
            {columns.map(column => (
              <SortableTableHead key={column} activeDirection={direction} activeSort={sort} align="right" defaultDirection={defaultPlayerSortDirection(column)} params={currentParams} path="/players" sortKey={column} title={titles[column]}>
                {PLAYER_TABLE_COLUMN_LABELS[column]}
              </SortableTableHead>
            ))}
          </TableRow></TableHeader>
          <TableBody>{rows.map(player => (
            <TableRow key={player.id}>
              <TableCell className="font-mono text-zinc-600">{player.performanceRank === null ? "—" : String(player.performanceRank).padStart(2, "0")}</TableCell>
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
                {player.provisional ? (
                  <Badge className="shrink-0" variant="muted">
                    Provisional
                  </Badge>
                ) : null}
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
