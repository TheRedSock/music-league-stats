import { createHash } from "node:crypto";

/** Per-process defense in depth. Hosts with multiple instances should also limit at the edge. */
export function createLoginRateLimiter(maximumKeys = 1024) {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (identity: string, now = Date.now()): number => {
    for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
    // Unknown clients share one bucket rather than trusting spoofable proxy headers.
    const key = createHash("sha256").update(identity).digest("hex");
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maximumKeys) return 60;
      bucket = { count: 0, expires: now + 15 * 60_000 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= 10) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.count++;
    return 0;
  };
}

export function loginClientIdentity(headers: Headers, vercel = process.env.VERCEL === "1"): string {
  // Vercel overwrites this header. Never trust arbitrary x-forwarded-for on a self-hosted server.
  return vercel ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "shared";
}

export const consumeLoginAttempt = createLoginRateLimiter();
