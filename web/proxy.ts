/**
 * Next.js 16 proxy (formerly middleware). Gates the entire app behind a
 * hardcoded PIN when APP_PIN is set in the environment.
 *
 * Matcher excludes the login page, auth API routes, and Next's own static
 * assets so the login flow can render without already being authenticated.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  authEnabled,
  verifySessionCookie,
} from "@/lib/auth/pin";

export async function proxy(request: NextRequest) {
  // Gate is opt-in. If APP_PIN is unset, behave like the original app.
  if (!authEnabled()) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionCookie(cookie)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  // Preserve the requested path so we can redirect back after a successful
  // login. Strip protocol + host because we always redirect within-app.
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target && target !== "/login") {
    loginUrl.searchParams.set("next", target);
  }

  // For API requests, return 401 instead of redirecting so fetch() callers
  // get a useful error rather than an HTML body.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match everything except:
  //   - /login (the login page itself)
  //   - /api/auth/* (login + logout endpoints)
  //   - /api/health (uptime probes shouldn't need a cookie)
  //   - Next's static asset paths
  //   - The /socket.io/ handshake (gated separately in server.ts)
  matcher: [
    "/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|socket\\.io).*)",
  ],
};
