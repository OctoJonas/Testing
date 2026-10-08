/**
 * ConversationManager — port of octonomy_client/conversation.py.
 *
 * One POST to create a conversation; captures conversation id (from body)
 * and `x-nonce` (from response headers — required for the Socket.IO auth).
 */
import type { CookieJar } from "tough-cookie";

import { fingerprint } from "../utils/safe-logging";
import type { ClientConfig } from "./config";
import { jarFetchOk } from "./http";

export class ConversationManager {
  conversationId: string | null = null;
  nonce: string | null = null;

  constructor(
    private readonly config: ClientConfig,
    private readonly jar: CookieJar,
    private readonly authToken: string,
    private readonly agentId: string,
  ) {}

  async createConversation(widgetId: string): Promise<boolean> {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = `${base}/api/appconnect/conversations/a/${this.agentId}`;
    const tenant = this.config.getTenant();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.authToken}`,
      "Content-Type": "application/json",
      Origin: this.config.origin,
      Referer: this.config.referer,
      "x-chat-type": "chatbot",
      "x-widget-id": widgetId,
      "x-widget-mode": "private",
      Cookie: `tenant=${tenant}`,
    };

    let response: Response;
    try {
      response = await jarFetchOk(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "New Chat", initialContext: {} }),
        cookieJar: this.jar,
      });
    } catch (err) {
      console.warn(`[octonomy/conversation] could not create conversation: ${(err as Error).message}`);
      return false;
    }

    let data: { id?: string };
    try {
      data = (await response.json()) as { id?: string };
    } catch {
      data = {};
    }

    if (data.id) {
      this.conversationId = data.id;
      console.log(
        `[octonomy/conversation] created id=${this.conversationId} (status=${response.status})`,
      );
    } else {
      console.warn(
        `[octonomy/conversation] response had no id (status=${response.status}, body=${JSON.stringify(data).slice(0, 200)})`,
      );
    }

    const nonce = response.headers.get("x-nonce");
    if (nonce) {
      this.nonce = nonce;
      if (this.config.verboseLogging) {
        console.log(`[octonomy/conversation] received x-nonce (fp=${fingerprint(nonce)})`);
      }
    } else {
      // Visible at info level (not just verbose) — the WebSocket auth needs
      // this nonce; if it's missing here we have to fall back to the auth one.
      console.warn(`[octonomy/conversation] response had no x-nonce header`);
    }

    return Boolean(this.conversationId);
  }

  getChannelName(): string {
    return `channel:${this.conversationId}`;
  }
}
