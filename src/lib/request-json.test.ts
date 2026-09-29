import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/request-json";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("requestJson", () => {
  it("reports a plain-text hosting timeout with HTTP status and request reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("An error occurred with your deployment", { status: 504, headers: { "x-vercel-id": "test-request" } })));
    await expect(requestJson("/api/test", {}, "Computing alignment")).rejects.toMatchObject({ retryable: true, status: 504, message: "Computing alignment (HTTP 504): The server timed out. Reference: test-request." });
  });
  it("preserves an application's validation error without retrying", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Unknown submission" }, { status: 400 })));
    await expect(requestJson("/api/test", {}, "Uploading votes")).rejects.toMatchObject({ retryable: false, message: "Uploading votes (HTTP 400): Unknown submission" });
  });
  it("rejects malformed success responses without exposing HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy</html>")));
    await expect(requestJson("/api/test", {}, "Reading status")).rejects.toThrow("invalid JSON response");
  });
  it("bounds a stalled request and describes the uncertain outcome", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    const result = expect(requestJson("/api/test", {}, "Committing import", 100)).rejects.toThrow("The request timed out. The server may still have completed the request.");
    await vi.advanceTimersByTimeAsync(100);
    await result;
  });
});
