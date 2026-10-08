/**
 * Hardcoded-PIN gate for the testing UI.
 *
 * Opt-in: when `APP_PIN` is empty/unset the gate is disabled and the app
 * behaves as before. When `APP_PIN` is set, every browser request and every
 * Socket.IO handshake must carry an `octonomy_session` cookie whose value is
 * `HMAC-SHA256(APP_PIN, APP_PIN)` — derived from the PIN itself so changing
 * the PIN invalidates every existing session automatically without needing a
 * separate signing secret.
 *
 * This is *not* meant to be cryptographically secure — it's a "keep casual
 * visitors out" gate. The HMAC just keeps the literal PIN out of the cookie
 * (and any logs) and provides timing-safe equality.
 *
 * Web Crypto is used so the same code runs in the Edge runtime (proxy.ts)
 * and the Node runtime (server.ts custom Socket.IO server).
 */

export const SESSION_COOKIE = "octonomy_session";
/**
 * 30 days. The cookie is HTTP-only, SameSite=Lax, and persists across
 * browser restarts. Reloads, navigations, and "close-and-reopen-tomorrow"
 * all reuse the same session — only PIN rotation or explicit logout clears
 * it. Override via APP_SESSION_TTL_SECONDS if you want a shorter window.
 */
export const SESSION_TTL_SECONDS = (() => {
  const raw = Number(process.env.APP_SESSION_TTL_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 60 * 60 * 24 * 30;
})();

/**
 * Hardcoded default PIN. Override via the `APP_PIN` environment variable on
 * deployments where you want a different value. Setting `APP_PIN` to an
 * empty string is treated the same as not setting it (default applies).
 */
const DEFAULT_PIN = "3400";

export function pinFromEnv(): string {
  const fromEnv = (process.env.APP_PIN ?? "").trim();
  return fromEnv || DEFAULT_PIN;
}

/**
 * The gate is always on now that we ship a default PIN. Kept as a function
 * (rather than a constant) so server-side and edge-runtime callers can ask
 * the same question and so a future "disable in tests" flag has a place to
 * live.
 */
export function authEnabled(): boolean {
  return pinFromEnv().length > 0;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return (
    (typeof btoa === "function"
      ? btoa(str)
      : Buffer.from(str, "binary").toString("base64"))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}

/**
 * Compute the session token for a given PIN. Same input → same output, so
 * the proxy and the Socket.IO server agree without sharing state.
 */
export async function sessionTokenFor(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(pin));
  return toBase64Url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySessionCookie(
  cookieValue: string | null | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const pin = pinFromEnv();
  if (!pin) return true; // gate disabled
  const expected = await sessionTokenFor(pin);
  return timingSafeEqual(cookieValue, expected);
}

/**
 * Parse a single cookie's value out of an HTTP `Cookie` header. Used by the
 * Socket.IO server, which gets the raw header on `socket.handshake.headers`.
 */
export function getCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
