/** A smaller slice of the available rounds needs stronger participation.
 * Logarithmic easing reaches one third quickly, and exactly at full scope.
 */
export function participationFraction(scopeRounds: number, totalRounds: number): number {
  if (!Number.isFinite(totalRounds) || totalRounds <= 0) return 1 / 2;
  const share = Math.min(1, Math.max(0, scopeRounds / totalRounds));
  return 1 / 2 - Math.log1p(9 * share) / Math.log(10) / 6;
}

export function qualificationRoundFloor(scopeRounds: number, totalRounds = scopeRounds): number {
  if (!Number.isFinite(scopeRounds) || scopeRounds <= 0) return 1;
  return Math.max(1, Math.ceil(scopeRounds * participationFraction(scopeRounds, totalRounds) - 1e-10));
}

export function qualificationFeatureFloor(scopeRounds: number, totalRounds = scopeRounds): number {
  return Math.min(20, Math.max(5, qualificationRoundFloor(scopeRounds, totalRounds) * 5));
}
