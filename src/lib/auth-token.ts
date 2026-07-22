import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const adminSessionCookieName = "music-league-admin";
export const adminSessionTtlSeconds = 8 * 60 * 60;

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
};

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function securePasswordEquals(
  candidate: string,
  expected: string,
): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export function createSessionToken(
  secret: string,
  now = new Date(),
): { token: string; expiresAt: Date } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + adminSessionTtlSeconds,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    token: `${encodedPayload}.${sign(encodedPayload, secret)}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = new Date(),
): boolean {
  if (!token) return false;
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return false;
  if (!safeEqual(signature, sign(encodedPayload, secret))) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const currentTime = Math.floor(now.getTime() / 1000);
    return (
      payload.v === 1 &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      typeof payload.nonce === "string" &&
      payload.nonce.length > 0 &&
      payload.iat <= currentTime + 60 &&
      payload.exp > currentTime &&
      payload.exp - payload.iat === adminSessionTtlSeconds
    );
  } catch {
    return false;
  }
}
