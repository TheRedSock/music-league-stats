import { NextResponse, type NextRequest } from "next/server";
import { consumePublicRequest, isPublicDataPath } from "@/lib/public-rate-limit";

export function proxy(request: NextRequest) {
  if (!isPublicDataPath(request.nextUrl.pathname)) return NextResponse.next();
  const retryAfter = consumePublicRequest(request.headers);
  if (!retryAfter) return NextResponse.next();
  const message = `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
  const headers = {
    "Retry-After": String(retryAfter),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  };
  return request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: message }, { status: 429, headers })
    : new NextResponse(message, { status: 429, headers });
}

// Include HEAD requests, RSC navigation, refreshes and prefetches. Client-supplied
// headers must not let a request skip the limit. Static assets and admin are free.
export const config = {
  matcher: ["/", "/songs/:path*", "/players/:path*", "/relationships/:path*", "/facts/:path*", "/api/players/:path*"],
};
