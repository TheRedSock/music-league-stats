import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    const parsed = loginSchema.safeParse(await request.json());
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
