import { describe, expect, it } from "vitest";

import {
  adminSessionTtlSeconds,
  createSessionToken,
  securePasswordEquals,
  verifySessionToken,
} from "@/lib/auth-token";

const secret = "a".repeat(32);
const now = new Date("2026-07-22T10:00:00.000Z");

describe("admin session tokens", () => {
  it("verifies a signed token before expiration", () => {
    const { token } = createSessionToken(secret, now);
    expect(verifySessionToken(token, secret, now)).toBe(true);
  });

  it("rejects tampering, wrong secrets, and expired tokens", () => {
    const { token } = createSessionToken(secret, now);
    const expiresAt = new Date(
      now.getTime() + adminSessionTtlSeconds * 1000,
    );
    expect(verifySessionToken(`${token}x`, secret, now)).toBe(false);
    expect(verifySessionToken(token, "b".repeat(32), now)).toBe(false);
    expect(verifySessionToken(token, secret, expiresAt)).toBe(false);
  });

  it("compares passwords without early string comparison", () => {
    expect(securePasswordEquals("correct horse", "correct horse")).toBe(true);
    expect(securePasswordEquals("correct horse", "wrong")).toBe(false);
  });
});
