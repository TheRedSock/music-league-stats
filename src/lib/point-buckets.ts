export type PointBucket = {
  label: "0" | "1" | "2" | "3" | "4" | "5" | "5+";
  count: number;
  pointTotal: number;
};

export type PointBucketRange = "standard" | "extended";

export const STANDARD_POINT_LABELS = ["1", "2", "3", "4", "5"] as const;

export function pointBucket(points: number): PointBucket["label"] {
  if (points <= 0) return "0";
  if (points >= 6) return "5+";
  return String(Math.floor(points)) as PointBucket["label"];
}

export function createPointDistribution(
  rows: Array<{ points: number; count?: number }>,
): PointBucket[] {
  const labels: PointBucket["label"][] = ["0", "1", "2", "3", "4", "5", "5+"];
  const counts = new Map(labels.map((label) => [label, 0]));
  const pointTotals = new Map(labels.map((label) => [label, 0]));
  for (const row of rows) {
    const label = pointBucket(row.points);
    const count = row.count ?? 1;
    counts.set(label, (counts.get(label) ?? 0) + count);
    pointTotals.set(label, (pointTotals.get(label) ?? 0) + row.points * count);
  }
  return labels.map((label) => ({
    label,
    count: counts.get(label) ?? 0,
    pointTotal: pointTotals.get(label) ?? 0,
  }));
}

export function filterPointBuckets(
  buckets: PointBucket[],
  range: PointBucketRange,
): PointBucket[] {
  if (range === "extended") return buckets;
  return buckets.filter((bucket) =>
    (STANDARD_POINT_LABELS as readonly string[]).includes(bucket.label),
  );
}
