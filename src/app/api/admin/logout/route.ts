import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import { adminSessionCookieName } from "@/lib/auth-token";

export async function POST(request: NextRequest) {
  try {
    requireAdminMutation(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminSessionCookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}
