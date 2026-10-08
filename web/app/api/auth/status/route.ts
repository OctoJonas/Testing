/**
 * GET /api/auth/status — lets the client know whether the PIN gate is on
 * (so the Logout button can be hidden when there's nothing to log out of).
 *
 * This is the only auth endpoint that's reachable without a session — by
 * design, since the app needs to ask the server "do I need a PIN?" before
 * deciding what UI to render.
 */
import { authEnabled } from "@/lib/auth/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ authEnabled: authEnabled() });
}
