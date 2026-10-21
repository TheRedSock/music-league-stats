import { createHash } from "node:crypto";
import { loginClientIdentity } from "@/lib/login-rate-limit";

/** Keep aligned with the Vercel firewall rule in config/public-rate-limit.json. */
export const publicDataPathPattern = /^\/(?:$|(?:songs|players|relationships|facts)(?:\/|$)|api\/players(?:\/|$))/;

export function isPublicDataPath(pathname: string): boolean {
  return publicDataPathPattern.test(pathname);
}

type Bucket = { tokens: number; updatedAt: number };

/** Defense in depth only: production also needs the shared hosting firewall rule. */
export function createPublicRequestLimiter(maximumKeys = 4096) {
  const clients = new Map<string, Bucket>();
  const global: Bucket = { tokens: 1200, updatedAt: 0 };
  function refill(bucket: Bucket, capacity: number, now: number) {
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.updatedAt) * capacity / 60_000);
    bucket.updatedAt = now;
  }
  return (headers: Headers, now = Date.now(), vercel = process.env.VERCEL === "1"): number => {
    for (const [key, bucket] of clients) {
      if (now - bucket.updatedAt >= 60_000) clients.delete(key);
    }
    refill(global, 1200, now);
    const identity = loginClientIdentity(headers, vercel);
    const key = createHash("sha256").update(identity).digest("hex");
    let client = clients.get(key);
    if (!client) {
      // Never evict an active bucket: otherwise rotating identities resets limits.
      if (clients.size >= maximumKeys) return 60;
      client = { tokens: 120, updatedAt: now };
      clients.set(key, client);
    }
    refill(client, 120, now);
    const retryMs = Math.max((1 - client.tokens) * 500, (1 - global.tokens) * 50, 0);
    if (retryMs > 0) return Math.max(1, Math.ceil(retryMs / 1000));
    client.tokens--;
    global.tokens--;
    return 0;
  };
}

export const consumePublicRequest = createPublicRequestLimiter();
