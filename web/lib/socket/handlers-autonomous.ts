/**
 * Autonomous test handlers — port of services/autonomous_handlers.py.
 */
import path from "node:path";

import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";

import { AutonomousTester } from "../agents/autonomous-agent";
import { ConnectionContext, connectionPool } from "../connection-pool";
import { StartAutonomousTestPayload } from "../schemas/autonomous";
import { atomicWriteJson } from "../utils/atomic-io";
import { onSessionTeardown, sessionKey } from "./session";

const exportsDir = path.join(process.cwd(), "exports");

interface SessionState {
  abort: AbortController;
  results: Awaited<ReturnType<AutonomousTester["runTest"]>> | null;
}

const sessionStates = new Map<string, SessionState>();

// Abort + free any in-flight autonomous run when the session is finally torn
// down (past the reconnect grace window).
onSessionTeardown((sid) => {
  const state = sessionStates.get(sid);
  if (state) {
    state.abort.abort();
    state.results = null;
    sessionStates.delete(sid);
  }
});

export function registerAutonomousHandlers(io: Server, socket: Socket): void {
  const sid = sessionKey(socket);

  socket.on("start_autonomous_test", async (raw) => {
    let payload;
    try {
      payload = StartAutonomousTestPayload.parse(raw);
    } catch (err) {
      const msg = err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : (err as Error).message;
      socket.emit("autonomous_test_error", { error: msg });
      return;
    }
    if (!connectionPool.hasConfig(sid)) {
      socket.emit("autonomous_test_error", { error: "Not configured. Please configure connection first." });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      socket.emit("autonomous_test_error", {
        error: "ANTHROPIC_API_KEY is required in the server environment.",
      });
      return;
    }

    // Cancel any in-flight run.
    sessionStates.get(sid)?.abort.abort();
    const abort = new AbortController();
    sessionStates.set(sid, { abort, results: null });

    let widgetClient;
    try {
      widgetClient = await connectionPool.getClient(sid, ConnectionContext.AUTONOMOUS, {
        autoCreate: true,
        autoConnect: true,
      });
    } catch (err) {
      socket.emit("autonomous_test_error", { error: (err as Error).message });
      return;
    }
    if (!widgetClient) {
      socket.emit("autonomous_test_error", { error: "Failed to create testing client" });
      return;
    }

    socket.emit("autonomous_test_started", {});

    void (async () => {
      try {
        const tester = new AutonomousTester({
          apiKey,
          metrics: payload.metrics,
          useRagas: payload.useRagas,
          satisfactoryThreshold: payload.satisfactoryThreshold,
        });
        const results = await tester.runTest({
          testingPrompt: payload.testingPrompt,
          maxTurns: payload.maxTurns,
          sessionId: sid,
          io,
          abort: abort.signal,
          widgetClient,
          enableEvaluation: payload.enableEvaluation,
          useRagas: payload.useRagas,
          satisfactoryThreshold: payload.satisfactoryThreshold,
        });
        const state = sessionStates.get(sid);
        if (state) state.results = results;
        io.to(sid).emit("autonomous_test_completed", results);
      } catch (err) {
        console.warn(`[autonomous] run failed:`, err);
        io.to(sid).emit("autonomous_test_error", { error: (err as Error).message });
      } finally {
        try {
          await connectionPool.disconnectContext(sid, ConnectionContext.AUTONOMOUS);
        } catch {
          // ignore
        }
      }
    })();
  });

  socket.on("stop_autonomous_test", () => {
    const state = sessionStates.get(sid);
    if (state) {
      state.abort.abort();
      socket.emit("autonomous_test_stopped", {});
    }
  });

  socket.on("save_autonomous_test_results", async () => {
    const state = sessionStates.get(sid);
    if (!state?.results) {
      socket.emit("save_error", { error: "No autonomous test results to save" });
      return;
    }
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
      const filename = `autonomous_${stamp}.json`;
      await atomicWriteJson(path.join(exportsDir, filename), state.results);
      socket.emit("autonomous_test_results_saved", { filename, message: `Autonomous test results saved to ${filename}` });
    } catch (err) {
      socket.emit("save_error", { error: (err as Error).message });
    }
  });

  // Teardown is coordinated centrally with a grace window (see ./session).
}
