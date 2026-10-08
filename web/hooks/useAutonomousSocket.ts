"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { socketService } from "@/services/socketService";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";
import type { AutonomousTestResult } from "@/lib/types";

interface UseAutonomousSocketProps {
  onConfigured: () => void;
  onAuthenticated: () => void;
  onConfigurationError: (error: string) => void;
  onAuthenticationError: (error: string) => void;
  onTestStarted: () => void;
  onTurnUpdate: (turn: number) => void;
  onConversationUpdate: (data: AutonomousTestResult) => void;
  onTestCompleted: (data: AutonomousTestResult) => void;
  onTestStopped: () => void;
  onTestError: (error: string) => void;
}

const OUR_CONTEXT = "autonomous";

function matchesContext(data: unknown, expected: string): boolean {
  if (data === null || typeof data !== "object") return true;
  const ctx = (data as { context?: unknown }).context;
  if (typeof ctx !== "string") return true;
  return ctx === expected;
}

export function useAutonomousSocket(props: UseAutonomousSocketProps) {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    // See useChatSocket — track our own handlers; never `socket.off(event)`
    // without a handler argument.
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
        console.error("[useAutonomousSocket]", err);
      }
    };

    const socket = socketService.getSocket();
    if (!socket) return;

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
      ConnectionStatusStore.set(OUR_CONTEXT, "connected");
      safe(() => propsRef.current.onAuthenticated());
    });
    attach(socket, "configuration_error", (data) => {
      const error = (data as { error?: string } | null)?.error ?? "Unknown";
      ConnectionStatusStore.set(OUR_CONTEXT, "error");
      safe(() => propsRef.current.onConfigurationError(error));
    });
    attach(socket, "authentication_error", (data) => {
      if (!matchesContext(data, OUR_CONTEXT)) return;
      const error = (data as { error?: string } | null)?.error ?? "Unknown";
      ConnectionStatusStore.set(OUR_CONTEXT, "error");
      safe(() => propsRef.current.onAuthenticationError(error));
    });
    attach(socket, "autonomous_test_started", () => safe(() => propsRef.current.onTestStarted()));
    attach(socket, "autonomous_turn_update", (data) => {
      const turn = (data as { turn?: number } | null)?.turn ?? 0;
      safe(() => propsRef.current.onTurnUpdate(turn));
    });
    attach(socket, "autonomous_conversation_update", (data) => {
      safe(() => propsRef.current.onConversationUpdate(data as AutonomousTestResult));
    });
    attach(socket, "autonomous_test_completed", (data) => {
      safe(() => propsRef.current.onTestCompleted(data as AutonomousTestResult));
    });
    attach(socket, "autonomous_test_stopped", () => safe(() => propsRef.current.onTestStopped()));
    attach(socket, "autonomous_test_error", (data) => {
      const error = (data as { error?: string } | null)?.error ?? "Unknown";
      safe(() => propsRef.current.onTestError(error));
    });

    // A transient drop must not kill a running test — the server keeps the run
    // alive through its grace window. See useTestPilotSocket for the rationale.
    const RECONNECT_GRACE_MS = 120_000;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const onDisconnect = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        graceTimer = null;
        try {
          propsRef.current.onTestError(
            "Connection lost and not restored. The test was interrupted — please reconnect and retry.",
          );
          propsRef.current.onTestStopped();
        } catch (err) {
          console.error("[useAutonomousSocket] grace expiry", err);
        }
      }, RECONNECT_GRACE_MS);
    };
    const onReconnect = () => {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
    };
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onReconnect);

    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      const s = socketService.getSocket();
      if (s) {
        for (const h of handlers) s.off(h.event, h.fn);
        s.off("disconnect", onDisconnect);
        s.off("connect", onReconnect);
      }
    };
  }, []);
}
