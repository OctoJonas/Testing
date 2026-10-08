/**
 * OctonomyAIClient — coordinator. Mirrors octonomy_client/client.py.
 */
import { CookieJar } from "tough-cookie";

import { AuthenticationManager } from "./auth";
import { ClientConfig } from "./config";
import { ConversationManager } from "./conversation";
import { SocketIOClient } from "./socket-client";
import type { ClientConfigInit, OctonomyClientLike } from "./types";

export class OctonomyAIClient implements OctonomyClientLike {
  readonly config: ClientConfig;
  readonly auth: AuthenticationManager;
  readonly socketClient: SocketIOClient;
  conversationManager: ConversationManager | null = null;
  private connected = false;
  private readonly jar = new CookieJar();

  constructor(init: ClientConfigInit) {
    this.config = new ClientConfig(init);
    this.auth = new AuthenticationManager(this.config, this.jar);
    this.socketClient = new SocketIOClient(this.config, this.jar);
  }

  async authenticate(): Promise<boolean> {
    return this.auth.authenticate();
  }

  async connect(): Promise<boolean> {
    if (!this.auth.authToken) {
      if (!(await this.authenticate())) {
        console.warn("[octonomy/client] connect: authenticate() returned false");
        return false;
      }
    }
    if (!this.auth.authToken || !this.auth.agentId) {
      console.warn(
        `[octonomy/client] connect: missing token (${Boolean(this.auth.authToken)}) ` +
          `or agentId (${this.auth.agentId ?? "null"}) after auth`,
      );
      return false;
    }

    this.conversationManager = new ConversationManager(
      this.config,
      this.jar,
      this.auth.authToken,
      this.auth.agentId,
    );

    const widgetId = this.auth.decodeWidgetId();
    if (!(await this.conversationManager.createConversation(widgetId))) {
      console.warn("[octonomy/client] connect: createConversation() returned false");
      return false;
    }
    if (!this.conversationManager.conversationId) {
      console.warn("[octonomy/client] connect: conversation has no id after create");
      return false;
    }
    // The conversation POST is *supposed* to return a fresh x-nonce, but the
    // Octonomy server sometimes only emits it from the auth call. Fall back
    // to the auth nonce so we don't dead-lock the WebSocket open.
    let nonce = this.conversationManager.nonce;
    if (!nonce && this.auth.nonce) {
      console.warn(
        "[octonomy/client] connect: conversation response had no x-nonce; " +
          "falling back to auth nonce",
      );
      nonce = this.auth.nonce;
      this.conversationManager.nonce = nonce;
    }
    if (!nonce) {
      console.warn(
        "[octonomy/client] connect: no x-nonce available from auth or conversation — " +
          "Socket.IO subscription will be rejected",
      );
      return false;
    }

    // Queue handler attach for the upcoming sio.connect() inside
    // socketClient.connect(); see SocketIOClient.attachHandlers.
    this.socketClient.setupEventHandlers(this.conversationManager.conversationId);

    const ok = await this.socketClient.connect({
      authToken: this.auth.authToken,
      widgetId,
      conversationId: this.conversationManager.conversationId,
      nonce,
      agentId: this.auth.agentId,
    });
    if (!ok) {
      console.warn(
        `[octonomy/client] connect: socketClient.connect failed — ` +
          `lastError=${this.socketClient.getLastError() ?? "n/a"}`,
      );
    }
    this.connected = ok;
    return ok;
  }

  async sendMessage(
    message: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string | null> {
    if (!this.connected || !this.conversationManager?.conversationId) {
      console.warn("[octonomy/client] not connected — call connect() first");
      return null;
    }
    if (onChunk) this.socketClient.setOnChunk(onChunk);
    try {
      return await this.socketClient.sendMessage(message, this.conversationManager.conversationId);
    } finally {
      // Per-call callback — clear so the next sendMessage doesn't accidentally
      // forward chunks to a stale handler.
      if (onChunk) this.socketClient.setOnChunk(null);
    }
  }

  async disconnect(): Promise<void> {
    await this.socketClient.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.socketClient.isConnected();
  }
}
