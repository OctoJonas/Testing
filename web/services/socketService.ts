/**
 * Singleton Socket.IO client used by all React hooks. Same connection lives
 * across tab switches; lazy-initialised on first use to avoid running in
 * server components.
 */
import { io, type Socket } from "socket.io-client";

import type { Config } from "@/lib/types";
import { API_URL } from "./api";
import { ConnectionStatusStore } from "./connectionStatusStore";
import { DiagnosticsBuffer } from "./diagnosticsBuffer";

export type ConnectionPhase = "connected" | "reconnecting" | "disconnected";

class SocketService {
  private socket: Socket | null = null;
  private connected = false;
  private hasConnectedOnce = false;
  /** Stable per-tab id; survives reconnects (and reloads, via sessionStorage). */
  private sessionId: string | null = null;
  /** Last config sent per context — replayed automatically on reconnect. */
  private configuredContexts = new Map<string, Config>();
  /** Subscribers to the transport lifecycle (drives the "Reconnecting…" UI). */
  private phaseListeners = new Set<(p: ConnectionPhase) => void>();

  /** Stable session id sent in the Socket.IO handshake auth. */
  private ensureSessionId(): string {
    if (this.sessionId) return this.sessionId;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("octo_session_id");
    } catch {
      // sessionStorage unavailable (private mode / SSR) — fall through.
    }
    if (!id) {
      id =
        globalThis.crypto?.randomUUID?.() ??
        `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      try {
        sessionStorage.setItem("octo_session_id", id);
      } catch {
        // best effort
      }
    }
    this.sessionId = id;
    return id;
  }

  /** Subscribe to transport phase changes. Returns an unsubscribe fn. */
  onPhase(listener: (p: ConnectionPhase) => void): () => void {
    this.phaseListeners.add(listener);
    return () => this.phaseListeners.delete(listener);
  }

  private emitPhase(phase: ConnectionPhase): void {
    for (const l of this.phaseListeners) {
      try {
        l(phase);
      } catch (err) {
        console.error("[socketService] phase listener threw:", err);
      }
    }
  }

  connect(): Socket {
    if (this.socket?.connected) return this.socket;
    // Empty path means "same origin" — Next.js + Socket.IO share the host.
    const socket = io(API_URL || undefined, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      randomizationFactor: 0.5,
      // Stable identity so the server can map a reconnected socket back to the
      // same session (config + in-flight runs survive the drop).
      auth: { sessionId: this.ensureSessionId() },
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.connected = true;
      DiagnosticsBuffer.record("in", "connect", [{ sid: socket.id }]);
      this.emitPhase("connected");
      // On a *re*connect, the browser is the only place that still knows the
      // widget config — replay it so the server (which may have grace-expired)
      // is reconfigured and the per-tab handshake chain re-runs.
      if (this.hasConnectedOnce) {
        for (const [ctx, cfg] of this.configuredContexts) {
          socket.emit("configure", {
            config: {
              widgetId: cfg.widgetId,
              baseUrl: cfg.baseUrl,
              origin: cfg.origin,
              referer: cfg.referer,
            },
            _context: ctx || undefined,
          });
        }
      }
      this.hasConnectedOnce = true;
    });
    socket.on("disconnect", (reason) => {
      this.connected = false;
      DiagnosticsBuffer.record("in", "disconnect", [{ reason }]);
      // "io server disconnect" / "io client disconnect" are intentional and
      // won't auto-reconnect; everything else is a transient drop.
      const willReconnect = reason !== "io server disconnect" && reason !== "io client disconnect";
      this.emitPhase(willReconnect ? "reconnecting" : "disconnected");
      // A permanent disconnect means every per-tab handshake is dead — don't
      // leave green "ready" dots pointing at a closed socket. (Transient drops
      // keep their dots: the reconnect replay re-runs the handshakes.)
      if (!willReconnect) ConnectionStatusStore.reset();
    });
    socket.on("connect_error", (err) => {
      DiagnosticsBuffer.record("in", "connect_error", [{ message: err.message }]);
      if (this.hasConnectedOnce) this.emitPhase("reconnecting");
    });
    // Capture every server → client event for the Diagnostics panel.
    socket.onAny((event: string, ...args: unknown[]) => {
      DiagnosticsBuffer.record("in", event, args);
    });
    // Wrap emit so client → server events are captured too.
    const origEmit = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: unknown[]) => {
      DiagnosticsBuffer.record("out", event, args);
      return origEmit(event, ...args);
    }) as typeof socket.emit;

    return socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.socket?.connected);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.hasConnectedOnce = false;
    this.configuredContexts.clear();
  }

  configure(config: Config, context?: string): void {
    // Remember the latest config per context so it can be replayed on reconnect.
    this.configuredContexts.set(context ?? "", config);
    this.socket?.emit("configure", {
      config: {
        widgetId: config.widgetId,
        baseUrl: config.baseUrl,
        origin: config.origin,
        referer: config.referer,
      },
      _context: context,
    });
  }

  authenticate(context?: string): void {
    this.socket?.emit("authenticate", { _context: context });
  }

  connectChat(context?: string): void {
    this.socket?.emit("connect_chat", { _context: context });
  }

  sendMessage(message: string, context?: string): void {
    this.socket?.emit("send_message", { message, _context: context });
  }

  cancelChat(context?: string): void {
    this.socket?.emit("cancel_chat", { _context: context });
  }

  disconnectChat(context?: string): void {
    // Honour the user's intent to close this chat: don't replay it on reconnect.
    this.configuredContexts.delete(context ?? "chat");
    this.socket?.emit("disconnect_chat", { _context: context });
  }

  saveConversation(config: Config): void {
    this.socket?.emit("save_conversation", { config });
  }

  startQATest(
    qaPairs: Array<{ Frage: string; Antwort: string }>,
    promptConfig?: {
      language?: "de" | "en";
      system_prompt?: string;
      evaluation_template?: string;
      satisfactory_threshold?: number;
      use_ragas?: boolean;
    },
    /** Original row numbers when re-running a subset (retry-errors flow). */
    indices?: number[],
  ): void {
    // Model + API key are no longer client-controlled. Backend always uses
    // Claude Sonnet 4 via ANTHROPIC_API_KEY.
    this.socket?.emit("start_qa_test", { qa_pairs: qaPairs, prompt_config: promptConfig, indices });
  }

  stopQATest(): void {
    this.socket?.emit("stop_qa_test", {});
  }

  pauseQATest(): void {
    this.socket?.emit("pause_qa_test", {});
  }

  resumeQATest(): void {
    this.socket?.emit("resume_qa_test", {});
  }

  saveQATestResults(): void {
    this.socket?.emit("save_qa_test_results", {});
  }

  startAutonomousTest(
    testingPrompt: string,
    maxTurns: number,
    enableEvaluation = false,
    evaluationConfig?: { metrics?: string[]; useRagas?: boolean; satisfactoryThreshold?: number },
  ): void {
    this.socket?.emit("start_autonomous_test", {
      testingPrompt,
      maxTurns,
      enableEvaluation,
      metrics: evaluationConfig?.metrics,
      useRagas: evaluationConfig?.useRagas,
      satisfactoryThreshold: evaluationConfig?.satisfactoryThreshold,
    });
  }

  stopAutonomousTest(): void {
    this.socket?.emit("stop_autonomous_test", {});
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
