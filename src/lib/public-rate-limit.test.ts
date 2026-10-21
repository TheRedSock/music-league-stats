import { describe, expect, it } from "vitest";
import rule from "../../config/public-rate-limit.json";
import { createPublicRequestLimiter, isPublicDataPath } from "./public-rate-limit";

const headers = (ip: string) => new Headers({ "x-vercel-forwarded-for": ip });

describe("public request limits", () => {
  it("allows normal browsing, limits a burst, and refills without a window reset", () => {
    const consume = createPublicRequestLimiter();
    for (let i = 0; i < 120; i++) expect(consume(headers("a"), 1000, true)).toBe(0);
    expect(consume(headers("a"), 1000, true)).toBe(1);
    expect(consume(headers("b"), 1000, true)).toBe(0);
    expect(consume(headers("a"), 1500, true)).toBe(0);
    expect(consume(headers("a"), 1500, true)).toBe(1);
  });

  it("bounds combined work even when a process sees many identities", () => {
    const consume = createPublicRequestLimiter();
    for (let client = 0; client < 10; client++) {
      for (let i = 0; i < 120; i++) expect(consume(headers(String(client)), 1000, true)).toBe(0);
    }
    expect(consume(headers("extra"), 1000, true)).toBe(1);
    expect(consume(headers("extra"), 1050, true)).toBe(0);
  });

  it("does not let spoofed forwarding headers reset a self-hosted limit", () => {
    const consume = createPublicRequestLimiter();
    for (let i = 0; i < 120; i++) expect(consume(headers(String(i)), 1000, false)).toBe(0);
    expect(consume(headers("new"), 1000, false)).toBe(1);
  });

  it("bounds memory without evicting active clients and releases idle buckets", () => {
    const consume = createPublicRequestLimiter(1);
    expect(consume(headers("a"), 1000, true)).toBe(0);
    expect(consume(headers("b"), 1000, true)).toBe(60);
    expect(consume(headers("b"), 61_000, true)).toBe(0);
  });

  it.each([
    ["/", true], ["/songs", true], ["/songs/", true], ["/players/example", true],
    ["/relationships/graphs", true], ["/facts", true], ["/api/players/id/votes", true],
    ["/admin", false], ["/api/admin/imports", false], ["/_next/static/test.js", false],
    ["/icon.svg", false], ["/faq", false], ["/songs-other", false],
  ])("matches the firewall and application paths for %s", (path, expected) => {
    const edgePattern = new RegExp(rule.conditionGroup[0].conditions[0].value);
    expect(isPublicDataPath(path)).toBe(expected);
    expect(edgePattern.test(path)).toBe(expected);
  });
});
