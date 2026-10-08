"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { socketService } from "@/services/socketService";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";
import type { QATestResults } from "@/lib/types";

interface UseTestPilotSocketProps {
  onConfigured: () => void;
  onAuthenticated: () => void;
  onConfigurationError: (error: string) => void;
  onAuthenticationError: (error: string) => void;
  onTestStarted: () => void;
  onTestProgress: (current: number) => void;
  onTestResult: (result: unknown) => void;
  onTestCompleted: (data: QATestResults) => void;
  onTestStopped: () => void;
  onTestPaused: () => void;
  onTestResumed: () => void;
  onTestError: (error: string) => void;
  onResultsSaved: (message: string) => void;
}

const OUR_CONTEXT = "qa_test";

function matchesContext(data: unknown, expected: string): boolean {
  if (data === null || typeof data !== "object") return true;
  const ctx = (data as { context?: unknown }).context;
  if (typeof ctx !== "string") return true;
  return ctx === expected;
}

export function useTestPilotSocket(props: UseTestPilotSocketProps) {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    // See useChatSocket — track our own handlers; never `socket.off(event)`
    // without a handler argument, because it removes every other tab's
    // listeners on the same shared socket.
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
        console.error("[useTestPilotSocket]", err);
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
    attach(socket, "qa_test_started", () => safe(() => propsRef.current.onTestStarted()));
    attach(socket, "qa_test_update", (data) => {
      const d = data as { type?: string; current?: number } | null;
      if (d?.type === "progress" && typeof d.current === "number") {
        safe(() => propsRef.current.onTestProgress(d.current as number));
      } else if (d?.type === "result") {
        safe(() => propsRef.current.onTestResult(d));
      }
    });
    attach(socket, "qa_test_completed", (data) => {
      const d = data as {
        total?: number;
        passed?: number;
        failed?: number;
        infrastructure_errors?: number;
        results?: {
          results?: unknown[];
          model?: string;
          timestamp?: string;
          threshold?: number;
          latency?: QATestResults["latency"];
        };
      } | null;
      safe(() =>
        propsRef.current.onTestCompleted({
          total: d?.total ?? 0,
          satisfactory: d?.passed ?? 0,
          failed: d?.failed ?? 0,
          infrastructure_errors: d?.infrastructure_errors ?? 0,
          threshold: d?.results?.threshold,
          latency: d?.results?.latency ?? null,
          results: (d?.results?.results as QATestResults["results"]) ?? [],
          model: d?.results?.model ?? "claude-sonnet-4-5",
          timestamp: d?.results?.timestamp ?? new Date().toISOString(),
        }),
      );
    });
    attach(socket, "qa_test_stopped", () => safe(() => propsRef.current.onTestStopped()));
    attach(socket, "qa_test_paused", () => safe(() => propsRef.current.onTestPaused()));
    attach(socket, "qa_test_resumed", () => safe(() => propsRef.current.onTestResumed()));
    attach(socket, "qa_test_error", (data) => {
      const error = (data as { error?: string } | null)?.error ?? "Unknown";
      safe(() => propsRef.current.onTestError(error));
    });
    attach(socket, "qa_test_results_saved", (data) => {
      const message = (data as { message?: string } | null)?.message ?? "Saved";
      safe(() => propsRef.current.onResultsSaved(message));
    });

    // A transient drop must not kill a running test: the server keeps the run
    // alive (SESSION_GRACE_SECONDS) and the reconnected socket re-joins the
    // room, so updates resume. Declare failure only if reconnect doesn't
    // happen within the grace window (kept above the server's so it wins).
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
          console.error("[useTestPilotSocket] grace expiry", err);
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
