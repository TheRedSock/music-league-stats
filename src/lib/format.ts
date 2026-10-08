export function ordinal(value: number): string {
  const rounded = Math.round(value);
  const suffix = rounded % 100 >= 11 && rounded % 100 <= 13 ? "th"
    : ["th", "st", "nd", "rd"][rounded % 10] ?? "th";
  return `${rounded}${suffix}`;
}

export function formatPoints(value: number): string {
  return `${value.toLocaleString()} ${value === 1 ? "pt" : "pts"}`;
}
