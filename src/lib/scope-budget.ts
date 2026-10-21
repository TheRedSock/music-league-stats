/** Database-backed rolling limits apply across revisions, instances and visitors. */
export function scopeCapacityMessage(recentStarts: number, activeJobs: number, dailyStarts = 0, monthlyStarts = 0): string | null {
  if (activeJobs >= 2) return "Other league comparisons are updating. Try this combination again in a few minutes, or select one league.";
  if (monthlyStarts >= 60) return "The calculation budget for new league combinations has been reached. Select one league or an existing combination, or try again later.";
  if (dailyStarts >= 24) return "Several league combinations have been calculated today. Select one league or an existing combination, or try again tomorrow.";
  if (recentStarts >= 8) return "Several new league comparisons were requested recently. Try this combination later, or select one league.";
  return null;
}

export function scopeRetryMessage(failures: number, failedAt: Date, now = Date.now()): string | null {
  if (failures >= 3) return "This league combination has failed repeatedly. Select one league or try again tomorrow after the calculation budget resets.";
  const cooldownMs = failures >= 2 ? 5 * 60_000 : 60_000;
  if (now - failedAt.getTime() < cooldownMs) return "This calculation was interrupted. Wait a few minutes before retrying, or select one league.";
  return null;
}

export class ScopeCapacityError extends Error {}
