import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  assertSameOrigin: vi.fn(),
  getAdminConfig: () => ({ configured: true, password: "test-password", secret: "test-secret-with-at-least-32-characters" }),
  adminErrorResponse: () => Response.json({ error: "Unexpected error" }, { status: 500 }),
}));
beforeEach(() => { vi.resetModules(); vi.stubEnv("VERCEL", ""); });
afterEach(() => vi.unstubAllEnvs());
const request = (body: string) => new NextRequest("http://localhost/api/admin/session", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body,
});

describe("admin login route", () => {
  it("rejects repeated passwords with a retry time instead of issuing a cookie", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 10; i++) expect((await POST(request('{"password":"wrong"}'))).status).toBe(401);
    const response = await POST(request('{"password":"test-password"}'));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects oversized and malformed JSON without a server error", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("a".repeat(8193)))).status).toBe(413);
    expect((await POST(request("{"))).status).toBe(400);
  });
  it("retains the signed HttpOnly session for a valid login", async () => {
    const { POST } = await import("./route");
    const response = await POST(request('{"password":"test-password"}'));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=strict");
  });
});
