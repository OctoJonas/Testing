/**
 * SocketIOClient — port of octonomy_client/socket_client.py.
 *
 * The single hardest piece of the migration. Implements the same response
 * state machine the Python SDK ships with:
 *
 *   - subscriptionEvent: latched on the `ack` event
 *   - responseEvent: latched when a final assistant message arrives
 *   - currentResponseChunks: accumulator for streaming chunks
 *   - toolExecutionInProgress / expectingFinalMessage: flags that delay the
 *     "no new chunks → assume complete" timeout when a tool call is mid-flight
 *   - errors with HTTP status >= 400 short-circuit the wait loop
 *
 * Behaviour intentionally mirrors the Python version line-by-line because the
 * Octonomy server's protocol is not documented anywhere else.
 */
import { type CookieJar } from "tough-cookie";
import { type Socket, io } from "socket.io-client";

import { fingerprint } from "../utils/safe-logging";
import type { ClientConfig } from "./config";
import { Latch } from "./latch";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface OctonomyMessage {
  messageType?: string;
  type?: string;
  id?: string;
  context?: {
    status?: number;
    author?: { content?: string; type?: string; error?: { message?: string } };
  };
}

export type AssistantMessageCallback = (text: string) => void;
export type ChunkCallback = (chunk: string) => void;

export class SocketIOClient {
  private sio: Socket | null = null;
  private agentId: string | null = null;

  /** Streaming/response state (rebuilt per send_message). */
  private currentResponseChunks: string[] = [];
  private lastStreamTime = 0;
  private waitingForResponse = false;
  private toolExecutionInProgress = false;
  private expectingFinalMessage = false;

  /** Latches reset between messages. */
  private subscriptionEvent = new Latch();
  private responseEvent = new Latch();

  private lastMessageId: string | null = null;
  private onAssistantMessageCallback: AssistantMessageCallback | null = null;
  /**
   * Per-chunk callback. Called for every streaming token as it arrives, so
   * the chat handler can forward it to the browser instantly. The
   * `onAssistantMessageCallback` still fires once at the end with the full
   * concatenated text.
   */
  private onChunkCallback: ChunkCallback | null = null;
  private lastError: string | null = null;

  constructor(private readonly config: ClientConfig, private readonly jar: CookieJar) {}

  isConnected(): boolean {
    return Boolean(this.sio?.connected);
  }

  isSubscribed(): boolean {
    return this.subscriptionEvent.isSet();
  }

  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Set the per-chunk callback. Lets `client.sendMessage` install a
   * forwarder that emits `message_chunk` events to the browser as each
   * streaming token arrives.
   */
  setOnChunk(cb: ChunkCallback | null): void {
    this.onChunkCallback = cb;
  }

  /** Wire up event handlers on the socket. Recreated per conversation. */
  setupEventHandlers(conversationId: string, onAssistantMessage?: AssistantMessageCallback): void {
    if (!this.sio) {
      // Handlers attach when connect() instantiates the socket.
      this.pendingHandlerSetup = { conversationId, onAssistantMessage };
      return;
    }
    this.attachHandlers(this.sio, conversationId, onAssistantMessage);
  }

  /** Set when setupEventHandlers is called before connect(). */
  private pendingHandlerSetup: { conversationId: string; onAssistantMessage?: AssistantMessageCallback } | null = null;

  private attachHandlers(
    sio: Socket,
    conversationId: string,
    onAssistantMessage?: AssistantMessageCallback,
  ): void {
    this.onAssistantMessageCallback = onAssistantMessage ?? null;

    // Drop any prior listeners — setupEventHandlers may be called multiple
    // times across conversations on the same connection.
    sio.removeAllListeners();

    sio.on("connect", () => {
      if (this.config.verboseLogging) console.log(`[octonomy/socket] connected ${sio.id}`);
      const channel = `channel:${conversationId}`;
      if (this.config.verboseLogging) console.log(`[octonomy/socket] subscribing to ${channel}`);
      sio.emit("subscribe", channel);
    });

    sio.on("disconnect", (reason) => {
      if (this.config.verboseLogging) console.log(`[octonomy/socket] disconnected: ${reason}`);
    });

    sio.on("connect_error", (err) => {
      console.warn(`[octonomy/socket] connect_error: ${err.message}`);
    });

    sio.on("ack", () => {
      if (this.config.verboseLogging) console.log("[octonomy/socket] subscription acknowledged");
      this.subscriptionEvent.set();
    });

    sio.on("error", (data: unknown) => {
      console.warn("[octonomy/socket] error:", data);
      this.waitingForResponse = false;
      this.responseEvent.set();
    });

    sio.on("stream", (data: OctonomyMessage) => this.handleStream(data));

    // The protocol delivers assistant messages on either "message" or
    // "assistant-message"; sometimes only the catch-all sees them.
    sio.on("message", (data: OctonomyMessage | OctonomyMessage[]) => this.handleMessageEnvelope(data));
    sio.on("assistant-message", (data: OctonomyMessage | OctonomyMessage[]) => this.handleMessageEnvelope(data));

    sio.onAny((event: string, data: unknown) => this.handleAny(event, data));
  }

  private emitChunk(content: string): void {
    if (!content) return;
    this.currentResponseChunks.push(content);
    this.lastStreamTime = Date.now();
    if (this.onChunkCallback) {
      try {
        this.onChunkCallback(content);
      } catch (err) {
        console.warn("[octonomy/socket] onChunkCallback threw:", err);
      }
    }
  }

  private handleStream(data: OctonomyMessage | unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as OctonomyMessage & { delta?: string; text?: string; done?: boolean };
    if (msg.messageType === "streaming") {
      const content = msg.context?.author?.content ?? "";
      if (content) {
        if (this.currentResponseChunks.length === 0 && this.config.verboseLogging) {
          console.log("[octonomy/socket] assistant streaming…");
        }
        this.emitChunk(content);
      }
      return;
    }
    // Legacy formats — kept for compatibility with the Python SDK.
    if (typeof msg.delta === "string") this.emitChunk(msg.delta);
    else if (typeof msg.text === "string") this.emitChunk(msg.text);
    if (msg.done) {
      this.waitingForResponse = false;
      this.responseEvent.set();
    }
  }

  private handleAny(event: string, data: unknown): void {
    // Tool-execution lifecycle: lets us delay the "no new chunks" timeout
    // while a tool call is in flight.
    if (event === "activity" && data && typeof data === "object") {
      const activity = data as { processType?: string; processStatus?: string };
      if (activity.processType === "tool-execution") {
        if (activity.processStatus === "in-progress") {
          this.toolExecutionInProgress = true;
          this.expectingFinalMessage = false;
        } else if (activity.processStatus === "completed") {
          this.toolExecutionInProgress = false;
          this.expectingFinalMessage = true;
        }
      }
    }
    if (event === "message" && data && typeof data === "object") {
      // Some servers route messages exclusively via the catch-all; re-dispatch.
      this.handleMessageEnvelope(data as OctonomyMessage);
    }
  }

  private handleMessageEnvelope(envelope: OctonomyMessage | OctonomyMessage[]): void {
    const messages = Array.isArray(envelope) ? envelope : [envelope];
    for (const msg of messages) {
      if (msg && typeof msg === "object") this.handleSingleMessage(msg);
    }
  }

  private handleSingleMessage(msg: OctonomyMessage): void {
    const messageType = msg.messageType ?? "";
    if (messageType === "assistant-message") {
      this.handleAssistantMessage(msg);
      return;
    }
    if (messageType === "user-message") {
      if (this.config.debugEnabled) console.log("[octonomy/socket] user message confirmed");
      return;
    }
    // No messageType — usually an error response.
    const status = msg.context?.status;
    const content = msg.context?.author?.content ?? "";
    if (status && status >= 400) {
      this.lastError = content || `Server error ${status}`;
      console.warn(`[octonomy/socket] server error (${status}): ${this.lastError}`);
      if (this.waitingForResponse) {
        this.resetResponseState();
        this.responseEvent.set();
      }
    }
  }

  private handleAssistantMessage(msg: OctonomyMessage): void {
    const content = msg.context?.author?.content ?? "";
    const dataType = msg.type ?? "";
    const status = msg.context?.status;

    // Transient HTTP-like errors: don't fail unless this is the final message.
    if (status && status >= 400) {
      const errMsg = msg.context?.author?.error?.message ?? "Unknown error";
      if (this.config.verboseLogging) {
        console.log(`[octonomy/socket] transient error ${status}: ${errMsg}`);
      }
      if (dataType === "api") {
        this.completeResponse(content || this.currentResponseChunks.join(""));
      }
      return;
    }

    // Some messages contain `400 ...` / `500 ...` strings from the server;
    // ignore unless this is the final message.
    if (
      content &&
      (content.startsWith("400 ") || content.startsWith("500 ") || content.startsWith("404 "))
    ) {
      if (this.config.verboseLogging) {
        console.log(`[octonomy/socket] ignoring error content: ${content.slice(0, 50)}…`);
      }
      if (dataType === "api") {
        this.completeResponse(this.currentResponseChunks.join(""));
      }
      return;
    }

    if (dataType === "stream") {
      // Streaming assistant message — keep waiting for the final api event.
      return;
    }
    if (dataType === "api") {
      // Final message — content carries the complete response. Fall back to
      // the streaming accumulator when the api payload is empty.
      this.lastMessageId = msg.id ?? this.lastMessageId;
      this.completeResponse(content || this.currentResponseChunks.join(""));
      return;
    }
    // Unknown type (e.g. "websocket"): treat as complete if we got content.
    if (content) {
      this.completeResponse(content);
    }
  }

  private completeResponse(text: string): void {
    if (text && this.onAssistantMessageCallback) {
      try {
        this.onAssistantMessageCallback(text);
      } catch (err) {
        console.warn("[octonomy/socket] assistant callback threw:", err);
      }
    }
    this.resetResponseState();
    this.responseEvent.set();
  }

  private resetResponseState(): void {
    this.currentResponseChunks = [];
    this.toolExecutionInProgress = false;
    this.expectingFinalMessage = false;
    this.waitingForResponse = false;
  }

  /**
   * Connect to the Octonomy Socket.IO server with retry+jitter. Subscribes
   * to the conversation channel and waits up to 5s for the `ack`.
   */
  async connect(args: {
    authToken: string;
    widgetId: string;
    conversationId: string;
    nonce: string;
    agentId?: string | null;
    maxRetries?: number;
    retryDelaySec?: number;
  }): Promise<boolean> {
    const { authToken, widgetId, conversationId, nonce, agentId = null } = args;
    const maxRetries = args.maxRetries ?? 3;
    const retryDelaySec = args.retryDelaySec ?? 1.0;

    this.agentId = agentId;
    const socketUrl = `${this.config.getSocketUrl()}?token=${encodeURIComponent(authToken)}`;
    const cookieHeader = await this.jar.getCookieString(this.config.baseUrl).catch(() => "");

    const extraHeaders: Record<string, string> = {
      Origin: this.config.origin,
      Referer: this.config.referer,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.6",
      "x-chat-type": "widget",
      "x-widget-id": widgetId,
      "x-widget-mode": "private",
      "x-conversation-id": conversationId,
      "x-nonce": nonce,
      Authorization: `Bearer ${authToken}`,
    };
    if (cookieHeader) extraHeaders.Cookie = cookieHeader;

    const auth = {
      widgetId,
      chatType: "widget",
      token: authToken,
      conversationId,
    };

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.config.verboseLogging) {
        console.log(
          `[octonomy/socket] connecting (attempt ${attempt + 1}/${maxRetries}) — ` +
            `${this.config.getSocketUrl()} (token fp=${fingerprint(authToken)})`,
        );
      }

      this.subscriptionEvent.reset();
      this.lastError = null;

      this.sio = io(socketUrl, {
        auth,
        extraHeaders,
        transports: ["polling", "websocket"],
        timeout: this.config.connectionTimeoutSec * 1000,
        reconnection: false,
      });

      // Attach handlers; pendingHandlerSetup may have been queued earlier.
      const pending = this.pendingHandlerSetup;
      this.pendingHandlerSetup = null;
      this.attachHandlers(
        this.sio,
        pending?.conversationId ?? conversationId,
        pending?.onAssistantMessage,
      );

      try {
        const connected = await new Promise<boolean>((resolve) => {
          if (!this.sio) return resolve(false);
          const onConnect = () => {
            this.sio?.off("connect_error", onError);
            resolve(true);
          };
          const onError = () => {
            this.sio?.off("connect", onConnect);
            resolve(false);
          };
          this.sio.once("connect", onConnect);
          this.sio.once("connect_error", onError);
          // Hard timeout in case neither fires.
          setTimeout(() => resolve(this.sio?.connected ?? false), this.config.connectionTimeoutSec * 1000);
        });

        if (!connected) {
          throw new Error("connect timed out");
        }

        const subscribed = await this.subscriptionEvent.wait(5_000);
        if (!subscribed && this.config.verboseLogging) {
          console.warn("[octonomy/socket] subscription not acked within 5s; continuing anyway");
        }
        return true;
      } catch (err) {
        lastErr = err;
        if (this.sio?.connected) {
          try { this.sio.disconnect(); } catch { /* ignore */ }
        }
        this.sio = null;
        if (attempt < maxRetries - 1) {
          const base = retryDelaySec * 2 ** attempt;
          const delay = Math.max(0, base * (1 + (Math.random() * 2 - 1) * 0.25)) * 1000;
          console.warn(
            `[octonomy/socket] connect attempt ${attempt + 1} failed: ${(err as Error).message}; retry in ${Math.round(delay)}ms`,
          );
          await sleep(delay);
        }
      }
    }

    this.lastError = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.warn(`[octonomy/socket] connect failed after ${maxRetries} attempts: ${this.lastError}`);
    return false;
  }

  /** Send a message and resolve with the assistant's reply text or null. */
  async sendMessage(message: string, conversationId: string): Promise<string | null> {
    if (!this.sio?.connected) {
      console.warn("[octonomy/socket] not connected");
      return null;
    }
    if (!this.subscriptionEvent.isSet()) {
      const ok = await this.subscriptionEvent.wait(3_000);
      if (!ok) {
        console.warn("[octonomy/socket] subscription timeout — cannot send");
        return null;
      }
    }

    this.lastError = null;
    this.currentResponseChunks = [];
    this.lastStreamTime = 0;
    this.toolExecutionInProgress = false;
    this.expectingFinalMessage = false;
    this.waitingForResponse = true;
    this.responseEvent.reset();

    // Capture the response text — the assistant callback writes here.
    let captured: string | null = null;
    const previousCallback = this.onAssistantMessageCallback;
    this.onAssistantMessageCallback = (text) => {
      captured = text;
      previousCallback?.(text);
    };

    const payload = {
      type: "api",
      transitions: {},
      task: {},
      conversationId,
      agentId: this.agentId,
      action: null,
      context: { author: { type: "user", content: message } },
      startedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      recipientId: this.sio.id,
      channel: `channel:${conversationId}`,
      parent: this.lastMessageId,
      isDebuggingEnabled: this.config.debugEnabled,
    };

    try {
      this.sio.emit("message", payload);
    } catch (err) {
      console.warn(`[octonomy/socket] failed to emit message: ${(err as Error).message}`);
      this.onAssistantMessageCallback = previousCallback;
      return null;
    }

    const responseTimeoutMs = this.config.responseTimeoutSec * 1000;
    const streamCompletionTimeoutMs = 2_000;
    const checkIntervalMs = 500;
    const start = Date.now();

    while (Date.now() - start < responseTimeoutMs) {
      const winner = await Promise.race([
        this.responseEvent.promise.then(() => "received" as const),
        sleep(checkIntervalMs).then(() => "tick" as const),
      ]);
      if (winner === "received") break;

      // Timer-based completion: if streaming has stopped and no tool call is
      // in flight, treat the accumulated chunks as the final reply.
      if (this.currentResponseChunks.length > 0 && this.lastStreamTime > 0) {
        const sinceLast = Date.now() - this.lastStreamTime;
        if (sinceLast >= streamCompletionTimeoutMs) {
          if (this.toolExecutionInProgress || this.expectingFinalMessage) continue;
          const fullResponse = this.currentResponseChunks.join("");
          if (fullResponse) this.completeResponse(fullResponse);
          break;
        }
      }
    }

    this.onAssistantMessageCallback = previousCallback;
    this.waitingForResponse = false;

    if (!this.responseEvent.isSet()) {
      console.warn(`[octonomy/socket] response timeout after ${this.config.responseTimeoutSec}s`);
      return null;
    }
    return captured;
  }

  async disconnect(): Promise<void> {
    if (this.sio?.connected) {
      try {
        this.sio.disconnect();
      } catch (err) {
        console.warn(`[octonomy/socket] error disconnecting: ${(err as Error).message}`);
      }
    }
    this.sio = null;
  }
}
