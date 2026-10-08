/**
 * POST /api/auth/login — accepts a PIN, sets the session cookie on match.
 *
 * 401 on wrong PIN, 503 if the gate isn't enabled (server has no APP_PIN
 * configured), 200 + Set-Cookie on success.
 */
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authEnabled,
  pinFromEnv,
  sessionTokenFor,
} from "@/lib/auth/pin";
import { checkLogin, recordFailure, recordSuccess } from "@/lib/auth/login-throttle";

/** Best-effort client key for throttling (Fly sets Fly-Client-IP). */
function clientKey(request: Request): string {
  return (
    request.headers.get("fly-client-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginPayload {
  pin?: unknown;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  if (!authEnabled()) {
    return Response.json(
      { error: "Authentication is not enabled on this server (APP_PIN unset)." },
      { status: 503 },
    );
  }

  let body: LoginPayload;
  try {
    body = (await request.json()) as LoginPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const submitted = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!submitted) {
    return Response.json({ error: "PIN is required" }, { status: 400 });
  }

  const key = clientKey(request);
  const status = checkLogin(key);
  if (status.locked) {
    return Response.json(
      {
        error: `Too many failed attempts. Try again in ${Math.ceil(status.retryAfterSec / 60)} minute(s).`,
        retryAfterSec: status.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(status.retryAfterSec) } },
    );
  }

  if (!timingSafeEqual(submitted, pinFromEnv())) {
    // Small delay to slow trivial scripts; the real brake is the lockout.
    await new Promise((r) => setTimeout(r, 250));
    const after = recordFailure(key);
    if (after.locked) {
      return Response.json(
        {
          error: `Too many failed attempts. Try again in ${Math.ceil(after.retryAfterSec / 60)} minute(s).`,
          retryAfterSec: after.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(after.retryAfterSec) } },
      );
    }
    return Response.json({ error: "Incorrect PIN", failures: after.failures }, { status: 401 });
  }

  recordSuccess(key);
  const token = await sessionTokenFor(pinFromEnv());
  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
