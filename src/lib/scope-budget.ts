/** Admission limits apply to new combinations; existing checkpoints remain resumable. */
export function scopeCapacityMessage(recentStarts: number, activeJobs: number): string | null {
  if (activeJobs >= 2) return "Other league comparisons are updating. Try this combination again in a few minutes, or select one league.";
  if (recentStarts >= 12) return "Several new league comparisons were requested recently. Try this combination later, or select one league.";
  return null;
}

export class ScopeCapacityError extends Error {}
