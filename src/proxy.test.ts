import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const mock = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/public-rate-limit", async (original) => ({
  ...await original<typeof import("@/lib/public-rate-limit")>(),
  consumePublicRequest: mock.consume,
}));

describe("public request proxy", () => {
  beforeEach(() => { mock.consume.mockReset(); mock.consume.mockReturnValue(0); });

  it("allows normal requests and does not limit assets or admin", () => {
    expect(proxy(new NextRequest("https://example.test/songs")).headers.get("x-middleware-next")).toBe("1");
    mock.consume.mockClear();
    for (const path of ["/admin", "/api/admin/imports", "/_next/static/app.js", "/faq"]) {
      expect(proxy(new NextRequest(`https://example.test${path}`)).headers.get("x-middleware-next")).toBe("1");
    }
    expect(mock.consume).not.toHaveBeenCalled();
  });

  it("rejects HEAD, RSC and spoofed prefetch requests with an uncached 429", async () => {
    mock.consume.mockReturnValue(12);
    for (const options of [{ method: "HEAD" }, { headers: { rsc: "1", "next-router-prefetch": "1", purpose: "prefetch" } }]) {
      const response = proxy(new NextRequest("https://example.test/relationships", options));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("12");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("x-middleware-next")).toBe(false);
    }
    const api = proxy(new NextRequest("https://example.test/api/players/id/votes"));
    expect(api.status).toBe(429);
    expect(await api.json()).toEqual({ error: expect.stringContaining("12 seconds") });
  });
});
