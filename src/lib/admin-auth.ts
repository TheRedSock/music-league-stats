import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import {
  adminSessionCookieName,
  verifySessionToken,
} from "@/lib/auth-token";

type AdminConfig =
  | { configured: true; password: string; secret: string }
  | { configured: false; message: string };

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

export function getAdminConfig(): AdminConfig {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password || !secret) {
    return {
      configured: false,
      message:
        "Admin access is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET, then restart the app.",
    };
  }
  if (secret.length < 32) {
    return {
      configured: false,
      message:
        "Admin access is not configured securely. ADMIN_SESSION_SECRET must be at least 32 characters.",
    };
  }
  return { configured: true, password, secret };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const config = getAdminConfig();
  if (!config.configured) return false;
  const cookieStore = await cookies();
  return verifySessionToken(
    cookieStore.get(adminSessionCookieName)?.value,
    config.secret,
  );
}

function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(":", "");
  return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

export function assertSameOrigin(request: NextRequest): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new AdminRequestError("Cross-site request rejected.", 403);
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin(request)) {
    throw new AdminRequestError("Request origin could not be verified.", 403);
  }
}

export function requireAdminMutation(request: NextRequest): void {
  assertSameOrigin(request);
  const config = getAdminConfig();
  if (!config.configured) {
    throw new AdminRequestError(config.message, 503);
  }
  const token = request.cookies.get(adminSessionCookieName)?.value;
  if (!verifySessionToken(token, config.secret)) {
    throw new AdminRequestError("Your admin session has expired.", 401);
  }
}

export function adminErrorResponse(error: unknown): Response {
  if (error instanceof AdminRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    { error: "The request could not be completed." },
    { status: 500 },
  );
}
