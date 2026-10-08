/**
 * fetch helper with cookie-jar support and retryable HTTP-error wrapping.
 *
 * Node's `fetch` doesn't auto-jar cookies the way `requests.Session` does in
 * Python; we use `tough-cookie` to thread cookies between the auth call and
 * the token-exchange call.
 */
import { CookieJar } from "tough-cookie";

import { defaultIsRetryable, retry, type RetryOptions } from "../utils/retry";

/** Thrown so retry's default isRetryable can inspect `.status`. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(message);
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface JarFetchInit extends RequestInit {
  cookieJar?: CookieJar;
}

export async function jarFetch(url: string, init: JarFetchInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookieJar) {
    const cookieHeader = await init.cookieJar.getCookieString(url);
    if (cookieHeader) {
      const existing = headers.get("Cookie");
      headers.set("Cookie", existing ? `${existing}; ${cookieHeader}` : cookieHeader);
    }
  }

  const response = await fetch(url, { ...init, headers });

  if (init.cookieJar) {
    // Node 20+ fetch exposes getSetCookie(); fall back to raw header on older.
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    for (const cookie of setCookies) {
      try {
        await init.cookieJar.setCookie(cookie, url);
      } catch {
        // Bad cookies shouldn't break the request.
      }
    }
  }

  return response;
}

/**
 * `jarFetch` + raise an HttpError on non-2xx and retry on 408/429/5xx +
 * network failures. Mirrors octonomy_client/auth.py:_request_with_retry.
 */
export async function jarFetchOk(
  url: string,
  init: JarFetchInit = {},
  retryOpts: RetryOptions = {},
): Promise<Response> {
  return retry(
    async () => {
      const res = await jarFetch(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpError(`HTTP ${res.status} for ${url}`, res.status, text);
        if (RETRYABLE_STATUS.has(res.status)) throw err;
        throw err; // retry decides via isRetryable
      }
      return res;
    },
    { ...retryOpts, isRetryable: retryOpts.isRetryable ?? defaultIsRetryable },
  );
}
