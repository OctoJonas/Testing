/**
 * Q&A test handlers — port of services/testing_handlers.py.
 *
 * One AbortController per session. `start_qa_test` cancels any previous run
 * before kicking off a new one. A wall-clock watchdog aborts the whole run
 * if it overshoots `len(qaPairs) * perQuestionTimeout`.
 */
import path from "node:path";

import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";

import { QATestingAgent, classifyWidgetResponse } from "../agents/qa-agent";
import { ConnectionContext, connectionPool } from "../connection-pool";
import { StartQATestPayload } from "../schemas/qa";
import { atomicWriteJson } from "../utils/atomic-io";
import * as rateLimit from "../utils/rate-limit";
import { withTimeout } from "../utils/timeout";
import { onSessionTeardown, sessionKey } from "./session";

const exportsDir = path.join(process.cwd(), "exports");
const PER_QUESTION_TIMEOUT_SEC = Number(process.env.QA_QUESTION_TIMEOUT_SECONDS ?? 180);
const WORKER_POOL_SIZE = Number(process.env.QA_WORKER_POOL_SIZE ?? 5);
/** Absolute safety cap on a whole run, regardless of question count (6h default). */
const QA_MAX_RUN_MS = Number(process.env.QA_MAX_RUN_SECONDS ?? 21_600) * 1_000;
/** Preflight canary: verify the widget gives a real answer before a full run. */
const QA_PREFLIGHT = process.env.QA_PREFLIGHT !== "false";
const PREFLIGHT_TIMEOUT_MS = Number(process.env.QA_PREFLIGHT_TIMEOUT_MS ?? 60_000);

/**
 * Send one canary question before committing to the whole run. A widget whose
 * backend is broken (e.g. its agent points at a nonexistent LLM model) fails
 * every question identically — better to abort in seconds with a message the
 * operator can act on than to grind out N identical errors.
 */
async function preflightCheck(
  sid: string,
  question: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = "qa_test_preflight";
  try {
    const client = await connectionPool.getClient(sid, ctx, { autoCreate: true, autoConnect: true });
    if (!client) return { ok: false, message: "Preflight failed: could not create a widget client." };
    const reply = await withTimeout(
      client.sendMessage(question),
      PREFLIGHT_TIMEOUT_MS,
      "preflight",
    ).catch(() => null);
    const kind = classifyWidgetResponse(reply);
    if (kind === "answered") return { ok: true };
    if (kind === "widget_error") {
      const modelMatch = /model:\s*([\w.:-]+)/.exec(reply ?? "");
      return {
        ok: false,
        message: modelMatch
          ? `Aborted before the run: the widget's agent is misconfigured — its LLM model "${modelMatch[1]}" was not found by the provider. Fix the agent's model setting in the platform, then rerun.`
          : `Aborted before the run: the widget returns errors instead of answers (${(reply ?? "").slice(0, 200)}).`,
      };
    }
    return {
      ok: false,
      message: `Aborted before the run: the widget did not answer a preflight question within ${Math.round(PREFLIGHT_TIMEOUT_MS / 1000)}s. It may be down or overloaded — try again or reduce load.`,
    };
  } catch (err) {
    return { ok: false, message: `Preflight failed: ${(err as Error).message}` };
  } finally {
    await connectionPool.disconnectContext(sid, ctx).catch(() => undefined);
  }
}

interface SessionState {
  abort: AbortController;
  watchdog: NodeJS.Timeout | null;
  results: Awaited<ReturnType<QATestingAgent["runTest"]>> | null;
}

const sessionStates = new Map<string, SessionState>();

function teardownSession(sid: string): void {
  const state = sessionStates.get(sid);
  if (!state) return;
  state.abort.abort();
  if (state.watchdog) clearTimeout(state.watchdog);
  // Release the (potentially large) results object eagerly.
  state.results = null;
  sessionStates.delete(sid);
}

// Abort + free any in-flight QA run when the session is finally torn down
// (past the reconnect grace window). A transient drop keeps the run alive so
// it can stream to the reconnected socket.
onSessionTeardown(teardownSession);

export function registerQAHandlers(io: Server, socket: Socket): void {
  const sid = sessionKey(socket);

  socket.on("start_qa_test", async (raw) => {
    if (!rateLimit.qaTestStarts.allow(sid)) {
      socket.emit("qa_test_error", { error: "Too many test starts; please wait before retrying." });
      return;
    }
    let payload;
    try {
      payload = StartQATestPayload.parse(raw);
    } catch (err) {
      const msg = err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : (err as Error).message;
      socket.emit("qa_test_error", { error: msg });
      return;
    }
    if (!connectionPool.hasConfig(sid)) {
      socket.emit("qa_test_error", { error: "Not configured. Please configure connection first." });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      socket.emit("qa_test_error", {
        error: "Anthropic API key is required. Set ANTHROPIC_API_KEY in the server environment.",
      });
      return;
    }

    // Cancel any in-flight run for this session.
    teardownSession(sid);

    const abort = new AbortController();
    // Watchdog accounts for the worker-pool parallelism (questions run
    // `WORKER_POOL_SIZE` at a time, not serially) with a 1.5x buffer, then
    // clamps to an absolute cap so a stuck run can't linger for days.
    const batches = Math.ceil(payload.qa_pairs.length / Math.max(1, WORKER_POOL_SIZE));
    const watchdogMs = Math.min(
      QA_MAX_RUN_MS,
      Math.max(60_000, Math.round(batches * PER_QUESTION_TIMEOUT_SEC * 1_000 * 1.5)),
    );
    const watchdog = setTimeout(() => {
      console.warn(`[qa] watchdog fired for session ${sid} after ${watchdogMs}ms`);
      abort.abort();
    }, watchdogMs);
    watchdog.unref?.();
    sessionStates.set(sid, { abort, watchdog, results: null });

    socket.emit("qa_test_started", { message: "Q&A test started" });

    void (async () => {
      try {
        if (QA_PREFLIGHT) {
          io.to(sid).emit("qa_test_update", {
            type: "preflight",
            message: "Preflight: verifying the widget answers before starting the run…",
          });
          const pf = await preflightCheck(sid, payload.qa_pairs[0].Frage);
          if (abort.signal.aborted) return;
          if (!pf.ok) {
            io.to(sid).emit("qa_test_error", { error: pf.message });
            return;
          }
        }

        const tester = new QATestingAgent({ apiKey, promptConfig: payload.prompt_config });
        const results = await tester.runTest({
          qaPairs: payload.qa_pairs,
          sessionId: sid,
          io,
          abort: abort.signal,
          workerPoolSize: WORKER_POOL_SIZE,
          perQuestionTimeoutMs: PER_QUESTION_TIMEOUT_SEC * 1_000,
          promptConfig: payload.prompt_config,
          indices: payload.indices,
        });

        const state = sessionStates.get(sid);
        if (state) state.results = results;

        const total = results.total;
        const satisfactory = results.satisfactory;
        const failed = total - satisfactory;
        io.to(sid).emit("qa_test_completed", {
          results,
          total,
          passed: satisfactory,
          failed,
          // Of `failed`, how many never got a real answer (widget/backend
          // failure) — these say nothing about answer quality.
          infrastructure_errors: results.infrastructure_errors,
          success_rate: total > 0 ? Math.round((satisfactory / total) * 1_000) / 10 : 0,
          message: "Q&A test completed successfully",
        });
      } catch (err) {
        console.warn(`[qa] run failed for session ${sid}:`, err);
        io.to(sid).emit("qa_test_error", { error: (err as Error).message });
      } finally {
        const state = sessionStates.get(sid);
        if (state?.watchdog) clearTimeout(state.watchdog);
        // Defensive cleanup: release every QA context (per-question contexts
        // are named qa_test_q{n}; normally each task's finally already did this).
        try {
          for (const ctx of connectionPool.getAllContexts(sid)) {
            if (ctx === ConnectionContext.QA_TEST || ctx.startsWith("qa_test_")) {
              await connectionPool.disconnectContext(sid, ctx);
            }
          }
        } catch {
          // ignore
        }
      }
    })();
  });

  socket.on("stop_qa_test", () => {
    const state = sessionStates.get(sid);
    if (state) {
      state.abort.abort();
      socket.emit("qa_test_stopped", { message: "Q&A test stop requested" });
    } else {
      socket.emit("qa_test_error", { error: "No active Q&A test found" });
    }
  });

  socket.on("save_qa_test_results", async () => {
    const state = sessionStates.get(sid);
    if (!state?.results) {
      socket.emit("save_error", { error: "No Q&A test results to save" });
      return;
    }
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
      const filename = `qa_test_${stamp}.json`;
      await atomicWriteJson(path.join(exportsDir, filename), state.results);
      socket.emit("qa_test_results_saved", { filename, message: `Q&A test results saved to ${filename}` });
    } catch (err) {
      socket.emit("save_error", { error: (err as Error).message });
    }
  });

  // Teardown is coordinated centrally with a grace window (see ./session) so a
  // transient disconnect doesn't abort a running test.
}
