/**
 * POST /api/auth/logout — clears the session cookie. Idempotent.
 */
import { SESSION_COOKIE } from "@/lib/auth/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookie = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    process.env.NODE_ENV === "production" ? "Secure" : "",
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
