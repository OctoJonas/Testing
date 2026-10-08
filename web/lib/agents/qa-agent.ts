/**
 * QATestingAgent — port of testing/backend/services/agents/qa_agent.py.
 *
 * Per-question worker pool (p-limit), Anthropic prompt caching on the system
 * prompt, Anthropic tool-use for structured JSON output, OpenAI fallback via
 * response_format=json_object. The connection pool guarantees that each
 * worker context is disconnected when the run finishes (or aborts), so we
 * cannot leak the per-question Octonomy clients the way the original Python
 * version did before the recent fix.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import pLimit from "p-limit";
import type { Server } from "socket.io";

import { connectionPool } from "../connection-pool";
import type { EvaluationMetrics, QAPair } from "../types";
import {
  EvaluationPromptConfig,
  getEvaluationPrompt,
  getSystemPrompt,
} from "./prompts";
import {
  buildEvaluationResultDict,
  errorEvaluationDict,
} from "./evaluation";
import { buildEvaluationToolSchema, resolveMetrics } from "./metrics";
import { withTimeout } from "../utils/timeout";
import type { PauseGate } from "./pause-gate";

/** Hard ceiling on a single evaluator (Anthropic/OpenAI) HTTP call. */
const SDK_TIMEOUT_MS = Number(process.env.EVALUATOR_TIMEOUT_MS ?? 60_000);
/** SDK-level retries for transient (429/5xx) evaluator errors. */
const SDK_MAX_RETRIES = Number(process.env.EVALUATOR_MAX_RETRIES ?? 2);

/**
 * Default evaluator model. The previous pin (`claude-sonnet-4-20250514`) is
 * deprecated and reaches EOL on 2026-06-15. Bumped to the current Sonnet 4.5.
 * Override via the EVALUATOR_MODEL env var if a future bump is needed without
 * a redeploy.
 */
const FIXED_MODEL = process.env.EVALUATOR_MODEL?.trim() || "claude-sonnet-4-5";

/**
 * Classify the widget's raw reply. The Octonomy socket relays upstream HTTP
 * errors as `<status> <json>` strings (e.g. `404 {"type":"error",...}` when
 * the agent's own LLM call fails). Those are infrastructure failures, not bot
 * answers — evaluating them as answers pollutes the pass rate and wastes
 * evaluator tokens.
 */
export type WidgetResponseKind = "answered" | "widget_error" | "no_response";

export function classifyWidgetResponse(actual: string | null): WidgetResponseKind {
  if (!actual || !actual.trim()) return "no_response";
  if (/^[45]\d{2}\s/.test(actual)) return "widget_error";
  return "answered";
}

interface RawMetrics {
  [key: string]: unknown;
}

/**
 * Keep exactly the selected metric keys (the tool schema already constrains
 * the model to them; this guards against drift and coerces non-numbers).
 * Unselected metrics are absent — not zero — so they can't drag the overall
 * score down.
 */
export function coerceMetrics(raw: RawMetrics, selected: string[]): EvaluationMetrics {
  const bag: Record<string, number> = {};
  for (const k of selected) {
    const v = raw[k];
    bag[k] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
  }
  return bag as unknown as EvaluationMetrics;
}

export interface QATestRunOptions {
  qaPairs: QAPair[];
  sessionId: string;
  io: Server;
  abort: AbortSignal;
  workerPoolSize?: number;
  perQuestionTimeoutMs?: number;
  /**
   * Original row numbers when this run re-tests a subset (retry-errors flow).
   * Aligned 1:1 with qaPairs; emitted results carry these indices so the
   * client can merge them into the original report.
   */
  indices?: number[];
  promptConfig?: {
    language?: "de" | "en";
    system_prompt?: string;
    evaluation_template?: string;
    satisfactory_threshold?: number;
    /** Selected metric keys (see lib/agents/metrics.ts). */
    metrics?: string[];
    /** Legacy flag — maps to the "rag" profile when `metrics` is absent. */
    use_ragas?: boolean;
  };
  /**
   * Optional pause gate. Workers `await pauseGate.wait(abort.signal)` before
   * starting each question — letting the operator suspend a long run mid
   * flight without losing partial results.
   */
  pauseGate?: PauseGate;
}

export class QATestingAgent {
  private readonly client: Anthropic | OpenAI;
  private readonly provider: "anthropic" | "openai";
  private readonly promptConfig: EvaluationPromptConfig;
  /** Resolved metric keys for this run — drives prompt + tool schema. */
  private readonly metrics: string[];
  /** Tool schema generated for exactly the selected metrics. */
  private readonly evaluationTool: { name: string; description: string; input_schema: ReturnType<typeof buildEvaluationToolSchema> };

  constructor(opts: { apiKey: string; promptConfig?: QATestRunOptions["promptConfig"] }) {
    if (FIXED_MODEL.toLowerCase().includes("claude")) {
      this.provider = "anthropic";
      this.client = new Anthropic({
        apiKey: opts.apiKey,
        timeout: SDK_TIMEOUT_MS,
        maxRetries: SDK_MAX_RETRIES,
      });
    } else {
      this.provider = "openai";
      this.client = new OpenAI({
        apiKey: opts.apiKey,
        timeout: SDK_TIMEOUT_MS,
        maxRetries: SDK_MAX_RETRIES,
      });
    }
    const cfg = opts.promptConfig ?? {};
    this.promptConfig = new EvaluationPromptConfig({
      language: cfg.language,
      systemPrompt: cfg.system_prompt,
      evaluationTemplate: cfg.evaluation_template,
      satisfactoryThreshold: cfg.satisfactory_threshold,
    });
    this.metrics = resolveMetrics({ metrics: cfg.metrics, use_ragas: cfg.use_ragas });
    this.evaluationTool = {
      name: "submit_evaluation",
      description:
        "Submit the structured evaluation of the assistant's response. " +
        "Populate every listed metric on a 0.0-1.0 scale.",
      input_schema: buildEvaluationToolSchema(this.metrics),
    };
  }

  async runTest(opts: QATestRunOptions): Promise<{
    timestamp: string;
    total: number;
    completed: number;
    satisfactory: number;
    /** Questions that hit a widget/backend failure rather than a bad answer. */
    infrastructure_errors: number;
    /** Pass threshold (0-1) used by the evaluator. */
    threshold: number;
    /** Widget round-trip stats over answered questions; null if none answered. */
    latency: { median_ms: number; p95_ms: number; max_ms: number } | null;
    results: Record<string, unknown>[];
    model: string;
  }> {
    const { qaPairs, sessionId, io, abort } = opts;
    const poolSize = Math.max(1, Math.min(opts.workerPoolSize ?? 5, qaPairs.length || 1));
    const limit = pLimit(poolSize);
    const cachedSystemPrompt = getSystemPrompt(this.promptConfig);

    const orderedResults: Record<string, unknown>[] = new Array(qaPairs.length).fill(null);
    let satisfactory = 0;
    let completed = 0;

    // Context per QUESTION, not per worker slot. Round-robin worker contexts
    // (`qa_test_w{n % poolSize}`) raced: when a fast question freed a p-limit
    // slot, the next task could grab a context still in use by a slow one and
    // disconnect its client mid-stream (observed in prod: shared
    // conversation_ids, truncated replies, "No response"). Unique contexts
    // make sharing impossible; each is torn down in the task's finally.

    const tasks = qaPairs.map((pair, idx) =>
      limit(async () => {
        if (abort.aborted) return;
        // Hold here while paused. Re-checks abort after waking so a "stop
        // while paused" exits cleanly.
        if (opts.pauseGate?.isPaused()) {
          await opts.pauseGate.wait(abort);
          if (abort.aborted) return;
        }
        // The index reported outward — the original row number on retries.
        const displayIdx = opts.indices?.[idx] ?? idx;
        const question = pair.Frage ?? "";
        const expected = pair.Antwort ?? "";
        if (!question || !expected) {
          // Don't silently drop empty rows — emit a visible skipped result so
          // the run's total/completed counts reconcile with the upload.
          const skipped = {
            index: displayIdx,
            question,
            expected_answer: expected,
            actual_response: "",
            context: null,
            skipped: true,
            ...errorEvaluationDict(
              "Skipped",
              "Row skipped: the question or expected answer was empty.",
              FIXED_MODEL,
            ),
          };
          orderedResults[idx] = skipped;
          completed++;
          io.to(sessionId).emit("qa_test_update", { type: "result", ...skipped });
          return;
        }

        io.to(sessionId).emit("qa_test_update", {
          type: "progress",
          index: displayIdx,
          current: idx + 1,
          total: qaPairs.length,
          question,
        });

        const workerContext = `qa_test_q${idx}`;

        let result: Record<string, unknown>;
        const widgetStart = Date.now();
        try {
          const { actual, conversationId } = await this.getWidgetResponse(
            sessionId,
            workerContext,
            question,
            opts.perQuestionTimeoutMs ?? 0,
          );
          const responseTimeMs = Date.now() - widgetStart;
          const kind = classifyWidgetResponse(actual);
          if (kind === "no_response") {
            result = {
              index: displayIdx,
              question,
              expected_answer: expected,
              actual_response: "No response",
              conversation_id: conversationId,
              context: workerContext,
              status: kind,
              response_time_ms: responseTimeMs,
              ...errorEvaluationDict(
                "No response received",
                "The widget did not provide a response within the timeout",
                FIXED_MODEL,
              ),
            };
          } else if (kind === "widget_error") {
            // Don't send infrastructure errors to the evaluator — flag them so
            // the report separates "bot answered badly" from "backend broken".
            result = {
              index: displayIdx,
              question,
              expected_answer: expected,
              actual_response: actual,
              conversation_id: conversationId,
              context: workerContext,
              status: kind,
              response_time_ms: responseTimeMs,
              ...errorEvaluationDict(
                "Widget backend error — not evaluated",
                `The widget relayed an upstream error instead of an answer: ${actual!.slice(0, 300)}`,
                FIXED_MODEL,
              ),
            };
          } else {
            const evaluation = await this.evaluateResponse(question, expected, actual!, cachedSystemPrompt);
            result = {
              index: displayIdx,
              question,
              expected_answer: expected,
              actual_response: actual,
              conversation_id: conversationId,
              context: workerContext,
              status: kind,
              response_time_ms: responseTimeMs,
              ...evaluation,
            };
          }
        } catch (err) {
          console.warn(`[qa] worker ${idx} failed:`, err);
          result = {
            index: displayIdx,
            question,
            expected_answer: expected,
            actual_response: `Worker error: ${(err as Error).message}`,
            context: workerContext,
            response_time_ms: Date.now() - widgetStart,
            ...errorEvaluationDict("Worker error", (err as Error).message, FIXED_MODEL),
          };
        } finally {
          await connectionPool.disconnectContext(sessionId, workerContext).catch(() => undefined);
        }

        orderedResults[idx] = result;
        completed++;
        if (result.is_satisfactory) satisfactory++;

        io.to(sessionId).emit("qa_test_update", { type: "result", index: idx, ...result });
      }),
    );

    await Promise.allSettled(tasks);

    const finalResults = orderedResults.filter(Boolean);
    // Latency stats over questions that got a real answer (errors/timeouts
    // would skew the picture of how fast the widget actually responds).
    const answeredTimes = finalResults
      .filter((r) => r.status === "answered" && typeof r.response_time_ms === "number")
      .map((r) => r.response_time_ms as number)
      .sort((a, b) => a - b);
    const percentile = (p: number): number =>
      answeredTimes[Math.min(answeredTimes.length - 1, Math.max(0, Math.ceil(p * answeredTimes.length) - 1))];
    const latency =
      answeredTimes.length > 0
        ? { median_ms: percentile(0.5), p95_ms: percentile(0.95), max_ms: answeredTimes[answeredTimes.length - 1] }
        : null;

    return {
      timestamp: new Date().toISOString(),
      total: qaPairs.length,
      completed,
      satisfactory,
      threshold: this.promptConfig.satisfactoryThreshold,
      latency,
      infrastructure_errors: finalResults.filter(
        (r) => r.status === "widget_error" || r.status === "no_response",
      ).length,
      results: finalResults,
      model: FIXED_MODEL,
    };
  }

  /**
   * One fresh client per question context: connect, ask, and let the caller's
   * finally tear it down. Contexts are unique per question, so no other task
   * can touch this client while the question is in flight.
   */
  private async getWidgetResponse(
    sessionId: string,
    workerContext: string,
    question: string,
    timeoutMs: number,
  ): Promise<{ actual: string | null; conversationId: string | null }> {
    const client = await connectionPool.getClient(sessionId, workerContext, {
      autoCreate: true,
      autoConnect: false,
    });
    if (!client) return { actual: null, conversationId: null };

    if (!client.isConnected()) {
      const ok = await client.connect();
      if (!ok) {
        console.warn(`[qa] connect failed for ${workerContext}`);
        await connectionPool.disconnectContext(sessionId, workerContext);
        return { actual: null, conversationId: null };
      }
    }

    const conversationId = client.conversationManager?.conversationId ?? null;
    // Bound the widget round-trip so one unresponsive question can't pin the
    // worker for the socket-client's full internal response timeout.
    const actual = await withTimeout(
      client.sendMessage(question),
      timeoutMs,
      `widget response (${workerContext})`,
    );
    return { actual, conversationId };
  }

  private async evaluateResponse(
    question: string,
    expected: string,
    actual: string,
    cachedSystemPrompt: string,
  ): Promise<Record<string, unknown>> {
    try {
      if (this.provider === "anthropic") {
        return await this.evaluateAnthropic(question, expected, actual, cachedSystemPrompt);
      }
      return await this.evaluateOpenAI(question, expected, actual, cachedSystemPrompt);
    } catch (err) {
      console.warn("[qa] evaluation error:", err);
      return errorEvaluationDict(
        `Evaluation error: ${(err as Error).message}`,
        "Could not evaluate response due to an error",
        FIXED_MODEL,
      );
    }
  }

  private async evaluateAnthropic(
    question: string,
    expected: string,
    actual: string,
    systemPrompt: string,
  ): Promise<Record<string, unknown>> {
    const evaluationPrompt = getEvaluationPrompt({
      config: this.promptConfig,
      question,
      expected,
      actual,
      metrics: this.metrics,
    });
    const anthropic = this.client as Anthropic;
    const response = await anthropic.messages.create({
      model: FIXED_MODEL,
      max_tokens: 1000,
      // Prompt caching: identical system prompt across every question in a
      // run, so we tokenize it once per ~5 minute cache window instead of
      // once per question. ~10x cheaper on the system block.
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: evaluationPrompt }],
      temperature: 0.3,
      tools: [this.evaluationTool],
      tool_choice: { type: "tool", name: "submit_evaluation" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "submit_evaluation") {
        const input = block.input as { metrics?: RawMetrics; evaluation?: string; reasoning?: string };
        const metrics = coerceMetrics(input.metrics ?? {}, this.metrics);
        return buildEvaluationResultDict({
          metrics,
          evaluation: input.evaluation ?? "",
          reasoning: input.reasoning ?? "",
          evaluatorModel: FIXED_MODEL,
          threshold: this.promptConfig.satisfactoryThreshold,
        });
      }
    }
    throw new Error("Anthropic returned no tool_use block");
  }

  private async evaluateOpenAI(
    question: string,
    expected: string,
    actual: string,
    systemPrompt: string,
  ): Promise<Record<string, unknown>> {
    const evaluationPrompt = getEvaluationPrompt({
      config: this.promptConfig,
      question,
      expected,
      actual,
      metrics: this.metrics,
    });
    const openai = this.client as OpenAI;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: evaluationPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned empty response");
    const parsed = JSON.parse(text) as { metrics?: RawMetrics; evaluation?: string; reasoning?: string };
    const metrics = coerceMetrics(parsed.metrics ?? {}, this.metrics);
    return buildEvaluationResultDict({
      metrics,
      evaluation: parsed.evaluation ?? "",
      reasoning: parsed.reasoning ?? "",
      evaluatorModel: FIXED_MODEL,
      threshold: this.promptConfig.satisfactoryThreshold,
    });
  }
}
