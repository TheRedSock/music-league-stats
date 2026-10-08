import { describe, expect, it } from "vitest";
import { createLoginRateLimiter, loginClientIdentity } from "./login-rate-limit";

describe("admin sign-in limits", () => {
  it("limits attempts, separates known clients, and expires the window", () => {
    const consume = createLoginRateLimiter();
    for (let i = 0; i < 10; i++) expect(consume("a", 1000)).toBe(0);
    expect(consume("a", 2000)).toBe(899);
    expect(consume("b", 2000)).toBe(0);
    expect(consume("a", 901000)).toBe(0);
  });
  it("bounds memory without evicting an active client's limit", () => {
    const consume = createLoginRateLimiter(1);
    expect(consume("a", 0)).toBe(0);
    expect(consume("b", 0)).toBe(60);
    expect(consume("b", 900000)).toBe(0);
  });
  it("does not accept spoofed forwarding headers on self-hosted deployments", () => {
    const headers = new Headers({ "x-forwarded-for": "attacker", "x-vercel-forwarded-for": "trusted" });
    expect(loginClientIdentity(headers, false)).toBe("shared");
    expect(loginClientIdentity(headers, true)).toBe("trusted");
  });
});
