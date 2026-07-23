export type QueryValue =
  | string
  | number
  | null
  | undefined
  | readonly (string | number)[];

export function buildAnalyticsHref(
  path: string,
  current: Record<string, QueryValue>,
  overrides: Record<string, QueryValue>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== "") query.append(key, String(item));
      }
    } else if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
