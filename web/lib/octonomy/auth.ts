/**
 * AuthenticationManager — port of octonomy_client/auth.py.
 *
 * Two-step auth:
 *   1. GET /api/appconnect/chat/chat-widget/v2/<widgetId>
 *      → x-widget-token (header), x-nonce (header), agent info (body)
 *   2. If agent.redirectUrl exists, exchange the widget token by GET-ing
 *      redirectUrl with Bearer auth — token returned via various header /
 *      cookie / body shapes.
 *
 * Both calls use a shared `tough-cookie` jar so the token-exchange step sees
 * cookies set by the first call (same behavior as `requests.Session` in
 * Python).
 */
import type { CookieJar } from "tough-cookie";

import { fingerprint } from "../utils/safe-logging";
import type { ClientConfig } from "./config";
import { jarFetchOk } from "./http";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export interface AuthState {
  authToken: string | null;
  nonce: string | null;
  widgetIdDecoded: string | null;
  agentId: string | null;
  agentName: string | null;
  agentType: string | null;
}

export class AuthenticationManager {
  private state: AuthState = {
    authToken: null,
    nonce: null,
    widgetIdDecoded: null,
    agentId: null,
    agentName: null,
    agentType: null,
  };

  constructor(private readonly config: ClientConfig, private readonly jar: CookieJar) {}

  get authToken(): string | null { return this.state.authToken; }
  get nonce(): string | null { return this.state.nonce; }
  get agentId(): string | null { return this.state.agentId; }
  get agentName(): string | null { return this.state.agentName; }
  get agentType(): string | null { return this.state.agentType; }

  /**
   * Decode the base64 widget id. Throws a clear error on the placeholder /
   * invalid-utf-8 case so users know to set a real widget id rather than
   * reading a low-level `invalid start byte` codec stack trace.
   */
  decodeWidgetId(): string {
    if (this.state.widgetIdDecoded) return this.state.widgetIdDecoded;
    let raw: Buffer;
    try {
      raw = Buffer.from(this.config.widgetId, "base64");
    } catch (err) {
      throw new Error(
        `Widget ID is not valid base64. Set a real widget ID in the configuration ` +
          `(got '${this.config.widgetId.slice(0, 16)}...').`,
        { cause: err },
      );
    }
    let decoded: string;
    try {
      decoded = raw.toString("utf-8");
      // Buffer.toString silently replaces invalid bytes with U+FFFD; detect that.
      if (decoded.includes("�")) throw new Error("contains replacement chars");
    } catch (err) {
      throw new Error(
        `Widget ID base64-decodes to non-UTF-8 bytes. The default ` +
          `'your-widget-id-here' placeholder won't work — paste your real widget ID into Settings.`,
        { cause: err },
      );
    }
    this.state.widgetIdDecoded = decoded;
    return decoded;
  }

  async authenticate(): Promise<boolean> {
    const widgetId = this.decodeWidgetId();
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = `${base}/api/appconnect/chat/chat-widget/v2/${widgetId}`;
    const tenant = this.config.getTenant();

    const headers: Record<string, string> = {
      "x-widget-id": widgetId,
      "x-chat-type": "widget",
      "x-widget-mode": "private",
      Referer: this.config.referer,
      Origin: this.config.origin,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Cookie: `tenant=${tenant}`,
    };

    if (this.config.verboseLogging) {
      console.log(`[octonomy/auth] authenticating with ${url}`);
    }

    let response: Response;
    try {
      response = await jarFetchOk(url, { method: "GET", headers, cookieJar: this.jar });
    } catch (err) {
      console.warn(`[octonomy/auth] authentication failed: ${(err as Error).message}`);
      return false;
    }

    const widgetToken = response.headers.get("x-widget-token");
    if (widgetToken) {
      this.state.authToken = widgetToken;
      if (this.config.verboseLogging) {
        console.log(`[octonomy/auth] received widget token (fp=${fingerprint(widgetToken)})`);
      }
    }

    const nonce = response.headers.get("x-nonce");
    if (nonce) {
      this.state.nonce = nonce;
      if (this.config.verboseLogging) {
        console.log(`[octonomy/auth] received x-nonce (fp=${fingerprint(nonce)})`);
      }
    }

    let data: { agent?: { id?: string; name?: string; type?: string; redirectUrl?: string } };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      console.warn(`[octonomy/auth] response was not JSON`);
      return Boolean(this.state.authToken);
    }

    if (data.agent) {
      this.state.agentId = data.agent.id ?? null;
      this.state.agentName = data.agent.name ?? null;
      this.state.agentType = data.agent.type ?? null;

      if (this.config.verboseLogging) {
        console.log(
          `[octonomy/auth] agent ${this.state.agentName} (${this.state.agentId}) ` +
            `isPrivate=${(data.agent as { isPrivate?: boolean }).isPrivate ?? "?"}`,
        );
      }

      if (data.agent.redirectUrl) {
        // Skip the OAuth-style exchange when the initial call already gave
        // us a widget token AND the agent is public — the exchange endpoint
        // 302's into Cognito for public widgets too, fails with HTTP 302,
        // and just adds noise to every connect. Only run the exchange when
        // we actually need it (private widget OR no token yet).
        const isPrivate = (data.agent as { isPrivate?: boolean }).isPrivate;
        const skipExchange = this.state.authToken && isPrivate === false;
        if (skipExchange) {
          if (this.config.verboseLogging) {
            console.log(
              "[octonomy/auth] skipping token exchange — public widget already has x-widget-token",
            );
          }
        } else {
          const exchanged = await this.exchangeToken(data.agent.redirectUrl);
          if (exchanged) {
            this.state.authToken = exchanged;
            if (this.config.verboseLogging) {
              console.log(`[octonomy/auth] exchanged for token (fp=${fingerprint(exchanged)})`);
            }
          }
        }
      }
    }

    // Return true only when we actually captured a token. The previous
    // behaviour (return true if HTTP 200) inherited a Python bug — the
    // caller would happily go on to open the WebSocket with `Bearer null`,
    // fail, and emit a generic "Connection failed". Surface the real cause
    // instead so the operator can fix their widget configuration.
    if (!this.state.authToken) {
      const isPrivate = (data.agent as { isPrivate?: boolean } | undefined)?.isPrivate;
      if (isPrivate === true) {
        throw new Error(
          `Widget authentication did not yield a token. The agent ` +
            `'${this.state.agentName}' is configured as private (isPrivate=true), ` +
            `which routes through SSO/OAuth — the SDK can only consume widgets that ` +
            `are set to public. Set the agent to public in the Octonomy platform.`,
        );
      }
      throw new Error(
        `Widget authentication did not yield a token. The auth response had no ` +
          `x-widget-token header and ${data.agent?.redirectUrl ? "the redirectUrl exchange failed" : "no redirectUrl was returned"}. ` +
          `Verify the widget id / origin / referer match what's whitelisted in Octonomy.`,
      );
    }
    return true;
  }

  private async exchangeToken(redirectUrl: string): Promise<string | null> {
    const tenant = this.config.getTenant();
    const headers: Record<string, string> = {
      // Some widgets accept the empty Bearer (token comes back via cookie);
      // others require it. We send what we have.
      Authorization: `Bearer ${this.state.authToken ?? ""}`,
      Origin: this.config.origin,
      Referer: this.config.referer,
      "x-chat-type": "widget",
      "x-widget-id": this.decodeWidgetId(),
      Cookie: `tenant=${tenant}`,
    };

    if (this.config.verboseLogging) {
      console.log(`[octonomy/auth] attempting token exchange against ${redirectUrl}`);
    }

    // Don't follow the OAuth redirect chain — if the exchange endpoint sends
    // us into Cognito's authorize flow, that means the widget is private and
    // the SDK can't proceed. Detect that and bail with a useful message.
    let response: Response;
    try {
      response = await jarFetchOk(
        redirectUrl,
        { method: "GET", headers, cookieJar: this.jar, redirect: "manual" },
      );
    } catch (err) {
      console.warn(`[octonomy/auth] token exchange failed: ${(err as Error).message}`);
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      if (/cognito|oauth2|auth\..*amazoncognito\.com|\/authorize\b/i.test(location)) {
        // Logged at warn level always — this is the most common failure mode
        // and the operator needs to see the cause without enabling verbose.
        console.warn(
          `[octonomy/auth] token exchange redirects to OAuth (${location.split("?")[0]}). ` +
            `The widget is gated behind SSO; set the agent to public in Octonomy to use ` +
            `it from the SDK.`,
        );
        return null;
      }
      // Some other redirect we don't understand — log and bail.
      console.warn(`[octonomy/auth] token exchange returned ${response.status} → ${location}`);
      return null;
    }

    const auth = response.headers.get("authorization");
    if (auth) return auth.replace(/^Bearer\s+/, "");
    const cognito = response.headers.get("x-cognito-token");
    if (cognito) return cognito;

    // Cookie sweep — the redirect endpoint sometimes drops a public_access_token cookie.
    const cookies = await this.jar.getCookies(redirectUrl).catch(() => []);
    const access = cookies.find((c) => c.key === "public_access_token");
    if (access?.value) {
      if (this.config.verboseLogging) {
        console.log("[octonomy/auth] found public_access_token cookie");
      }
      return access.value;
    }

    try {
      const data = (await response.json()) as Record<string, unknown>;
      for (const key of ["token", "cognitoToken", "accessToken"]) {
        if (typeof data[key] === "string") return data[key] as string;
      }
    } catch {
      // body wasn't JSON
    }

    return null;
  }
}
