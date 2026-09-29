/** The checkpoint identity also distinguishes calculations within a league. */
export function analyticsProgressKey(progress: {
  stepIndex: number;
  leagueIndex?: number;
  leagueStepIndex?: number;
} | null | undefined): string {
  return progress ? `${progress.stepIndex}:${progress.leagueIndex ?? 0}:${progress.leagueStepIndex ?? 0}` : "";
}

export const LEAGUE_CALCULATIONS = [
  { id: "players", label: "player stats" },
  { id: "point-distribution", label: "point distribution" },
  { id: "player-point-distribution", label: "player point distributions" },
  { id: "relationship-pairs", label: "directional relationships" },
  { id: "relationship-mutual", label: "mutual relationships" },
  { id: "relationship-alignment", label: "vote-pattern alignment" },
] as const;
