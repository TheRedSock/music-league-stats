import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLoginAttempt, loginClientIdentity } from "@/lib/login-rate-limit";

import {
  adminErrorResponse,
  assertSameOrigin,
  getAdminConfig,
} from "@/lib/admin-auth";
import {
  adminSessionCookieName,
  createSessionToken,
  securePasswordEquals,
} from "@/lib/auth-token";

const loginSchema = z
  .object({ password: z.string().min(1).max(1024) })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const config = getAdminConfig();
    if (!config.configured) {
      return NextResponse.json({ error: config.message }, { status: 503 });
    }
    const retryAfter = consumeLoginAttempt(loginClientIdentity(request.headers));
    if (retryAfter) {
      return NextResponse.json({ error: "Too many sign-in attempts. Please try again later." }, {
        status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
      });
    }
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Enter a password." }, { status: 400 });
    let length = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 8192) {
          await reader.cancel();
          return NextResponse.json({ error: "Sign-in request is too large." }, { status: 413 });
        }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
    catch { return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 }); }
    const parsed = loginSchema.safeParse(body);
    if (
      !parsed.success ||
      !securePasswordEquals(parsed.data.password, config.password)
    ) {
      return NextResponse.json(
        { error: "The password is incorrect." },
        { status: 401 },
      );
    }

    const { token, expiresAt } = createSessionToken(config.secret);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminSessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: expiresAt,
    });
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}
