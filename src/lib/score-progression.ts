/** Client-safe progression model. Rows are player totals within an exported round. */
export type ProgressionRow = {
  leagueId: string;
  leagueName: string;
  roundId: string;
  roundName: string;
  ordinal: number;
  playerId: string;
  playerName: string;
  points: number;
};

/** Five integer ticks with modest headroom, without auto-domain magnitude jumps. */
export function progressionPointTicks(maximum: number): number[] {
  const maximumWithPadding = Math.max(1, maximum) * 1.03;
  const granularity = Math.max(1, 10 ** Math.floor(Math.log10(Math.max(1, maximum))) / 20);
  const step = Math.ceil(maximumWithPadding / 4 / granularity) * granularity;
  return Array.from({ length: 5 }, (_, index) => index * step);
}

export function progressionTopPlayerIds(
  standings: Array<{ id: string; rank: number }>,
  limit: number | null,
): Set<string> {
  return new Set(standings.filter((player) => limit === null || player.rank <= limit).map((player) => player.id));
}

export function buildProgression(rows: ProgressionRow[]) {
  const players = [...new Map(rows.map((row) => [row.playerId, {
    id: row.playerId, name: row.playerName,
  }])).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const rounds = [...new Map(rows.map((row) => [row.roundId, {
    id: row.roundId, name: row.roundName, ordinal: row.ordinal,
  }])).values()].sort((a, b) => a.ordinal - b.ordinal);
  const scores = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const round = scores.get(row.roundId) ?? new Map<string, number>();
    round.set(row.playerId, (round.get(row.playerId) ?? 0) + row.points);
    scores.set(row.roundId, round);
  }
  const totals = new Map(players.map((player) => [player.id, 0]));
  const timeline = rounds.map((round) => {
    const roundScores = scores.get(round.id)!;
    const values = players.map((player) => {
      const points = roundScores.get(player.id) ?? 0;
      const total = totals.get(player.id)! + points;
      totals.set(player.id, total);
      return { ...player, points, total, entered: roundScores.has(player.id), rank: 0 };
    });
    const sorted = [...values].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    sorted.forEach((player, index) => {
      player.rank = index > 0 && player.total === sorted[index - 1].total
        ? sorted[index - 1].rank : index + 1;
    });
    return { ...round, values, standings: sorted };
  });
  return { players, timeline };
}
