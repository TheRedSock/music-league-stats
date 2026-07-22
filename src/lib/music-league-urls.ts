const MUSIC_LEAGUE_BASE_URL = "https://app.musicleague.com/l";

export function musicLeagueUrl(
  musicLeagueId: string | null | undefined,
  sourceRoundId?: string | null,
): string | null {
  if (!musicLeagueId) return null;
  const leaguePath = `${MUSIC_LEAGUE_BASE_URL}/${encodeURIComponent(
    musicLeagueId,
  )}`;
  return sourceRoundId
    ? `${leaguePath}/${encodeURIComponent(sourceRoundId)}`
    : leaguePath;
}
