"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { socketService } from "@/services/socketService";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";

interface UseChatSocketProps {
  onConfigured: () => void;
  onAuthenticated: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onMessageChunk: (chunk: string) => void;
  onMessageComplete: (reply?: string) => void;
  onMessageError: (error: string) => void;
  onChatCancelled: (message: string) => void;
  onConversationSaved: (message: string) => void;
  onConfigurationError: (error: string) => void;
  onAuthenticationError: (error: string) => void;
  onConnectionError: (error: string) => void;
}

const OUR_CONTEXT = "chat";

/**
 * Most server → client events carry a `context` field that names which tab's
 * configure/authenticate triggered them. Multiple tabs share one Socket.IO
 * singleton, so without filtering, every tab reacts to every event.
 */
function matchesContext(data: unknown, expected: string): boolean {
  if (data === null || typeof data !== "object") return true;
  const ctx = (data as { context?: unknown }).context;
  if (typeof ctx !== "string") return true;
  return ctx === expected;
}

export function useChatSocket(props: UseChatSocketProps) {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    // Track our own handlers so cleanup removes only what we attached.
    // CRITICAL: never call `socket.off(event)` without a handler argument —
    // that nukes every listener for that event, including ones attached by
    // useTestPilotSocket / useAutonomousSocket on the same shared socket.
    const handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];

    const attach = (socket: Socket, event: string, fn: (data: unknown) => void) => {
      const wrapped = ((data: unknown) => fn(data)) as (...args: unknown[]) => void;
      socket.on(event, wrapped);
      handlers.push({ event, fn: wrapped });
    };

    const safe = (fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.error("[useChatSocket]", err);
      }
    };

    // A transient transport drop shouldn't tear the chat down — an in-flight
    // reply resumes streaming after reconnect. Reset only if reconnect doesn't
    // happen within the grace window. See useTestPilotSocket for the rationale.
    const RECONNECT_GRACE_MS = 120_000;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const clearGrace = () => {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
    };

    const setup = () => {
      const socket = socketService.getSocket();
      if (!socket) return false;

      attach(socket, "configured", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        ConnectionStatusStore.set(OUR_CONTEXT, "authenticating");
        safe(() => {
          propsRef.current.onConfigured();
          socketService.authenticate(OUR_CONTEXT);
        });
      });
      attach(socket, "authenticated", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        ConnectionStatusStore.set(OUR_CONTEXT, "connecting");
        safe(() => {
          propsRef.current.onAuthenticated();
          socketService.connectChat(OUR_CONTEXT);
        });
      });
      attach(socket, "chat_connected", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        ConnectionStatusStore.set(OUR_CONTEXT, "connected");
        safe(() => propsRef.current.onConnected());
      });
      attach(socket, "disconnected", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        ConnectionStatusStore.set(OUR_CONTEXT, "idle");
        safe(() => propsRef.current.onDisconnected());
      });
      attach(socket, "message_chunk", (data) => {
        const chunk = (data as { chunk?: string } | null)?.chunk ?? "";
        safe(() => propsRef.current.onMessageChunk(chunk));
      });
      attach(socket, "message_complete", (data) => {
        const reply = (data as { reply?: string } | null)?.reply;
        safe(() => propsRef.current.onMessageComplete(reply));
      });
      attach(socket, "message_error", (data) => {
        const error = (data as { error?: string } | null)?.error ?? "Unknown error";
        safe(() => propsRef.current.onMessageError(error));
      });
      attach(socket, "chat_cancelled", (data) => {
        const message = (data as { message?: string } | null)?.message ?? "Cancelled";
        safe(() => propsRef.current.onChatCancelled(message));
      });
      attach(socket, "conversation_saved", (data) => {
        const message = (data as { message?: string } | null)?.message ?? "Saved";
        safe(() => propsRef.current.onConversationSaved(message));
      });
      attach(socket, "configuration_error", (data) => {
        const error = (data as { error?: string } | null)?.error ?? "Unknown error";
        ConnectionStatusStore.set(OUR_CONTEXT, "error");
        safe(() => propsRef.current.onConfigurationError(error));
      });
      attach(socket, "authentication_error", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        const error = (data as { error?: string } | null)?.error ?? "Unknown error";
        ConnectionStatusStore.set(OUR_CONTEXT, "error");
        safe(() => propsRef.current.onAuthenticationError(error));
      });
      attach(socket, "connection_error", (data) => {
        if (!matchesContext(data, OUR_CONTEXT)) return;
        const error = (data as { error?: string } | null)?.error ?? "Unknown error";
        ConnectionStatusStore.set(OUR_CONTEXT, "error");
        safe(() => propsRef.current.onConnectionError(error));
      });

      // Transport-level lifecycle (distinct from the server's domain
      // "disconnected" event, which only fires on an explicit disconnect_chat).
      attach(socket, "disconnect", () => {
        clearGrace();
        graceTimer = setTimeout(() => {
          graceTimer = null;
          ConnectionStatusStore.set(OUR_CONTEXT, "error");
          safe(() => {
            propsRef.current.onMessageError("Connection lost. Reconnect to continue.");
            propsRef.current.onDisconnected();
          });
        }, RECONNECT_GRACE_MS);
      });
      attach(socket, "connect", () => clearGrace());
      return true;
    };

    if (!setup()) {
      const retry = setInterval(() => {
        if (setup()) clearInterval(retry);
      }, 100);
      const stop = setTimeout(() => clearInterval(retry), 5_000);
      return () => {
        clearInterval(retry);
        clearTimeout(stop);
        clearGrace();
        const socket = socketService.getSocket();
        if (socket) for (const h of handlers) socket.off(h.event, h.fn);
      };
    }

    return () => {
      clearGrace();
      const socket = socketService.getSocket();
      if (socket) for (const h of handlers) socket.off(h.event, h.fn);
    };
  }, []);
}
