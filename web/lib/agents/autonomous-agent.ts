/**
 * AutonomousTester — port of testing/backend/services/agents/autonomous_agent.py.
 *
 * Drives a multi-turn conversation: Claude generates each "user" question
 * given the conversation history + a top-level testing prompt; the widget
 * answers; we optionally evaluate each turn.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Server } from "socket.io";

import type { AutonomousConversation, AutonomousTestResult, EvaluationMetrics } from "../types";
import type { OctonomyClientLike } from "../octonomy/types";
import { buildEvaluationResultDict, errorEvaluationDict } from "./evaluation";
import {
  buildMetricInstructions,
  buildMetricsJsonShape,
  getProfile,
  sanitizeMetricKeys,
} from "./metrics";
import { abortableSleep, withTimeout } from "../utils/timeout";

const FIXED_MODEL = process.env.EVALUATOR_MODEL?.trim() || "claude-sonnet-4-5";
const SDK_TIMEOUT_MS = Number(process.env.EVALUATOR_TIMEOUT_MS ?? 60_000);
const SDK_MAX_RETRIES = Number(process.env.EVALUATOR_MAX_RETRIES ?? 2);
/** Hard ceiling on a single widget round-trip per turn. */
const TURN_WIDGET_TIMEOUT_MS = Number(process.env.AUTONOMOUS_TURN_TIMEOUT_MS ?? 120_000);

interface RawMetrics {
  [key: string]: unknown;
}

/** Keep exactly the selected metric keys; absent (not zero) otherwise. */
function coerceSelectedMetrics(raw: RawMetrics, selected: string[]): EvaluationMetrics {
  const bag: Record<string, number> = {};
  for (const k of selected) {
    const v = raw[k];
    bag[k] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
  }
  return bag as unknown as EvaluationMetrics;
}

export interface AutonomousRunOptions {
  testingPrompt: string;
  maxTurns: number;
  sessionId: string;
  io: Server;
  abort: AbortSignal;
  widgetClient: OctonomyClientLike;
  enableEvaluation?: boolean;
  useRagas?: boolean;
  satisfactoryThreshold?: number;
}

export class AutonomousTester {
  private readonly anthropic: Anthropic;
  /** Per-turn metric keys, from the conversational profiles in the registry. */
  private readonly metrics: string[];
  private readonly threshold: number;

  constructor(opts: {
    apiKey: string;
    metrics?: string[];
    useRagas?: boolean;
    satisfactoryThreshold?: number;
  }) {
    this.anthropic = new Anthropic({
      apiKey: opts.apiKey,
      timeout: SDK_TIMEOUT_MS,
      maxRetries: SDK_MAX_RETRIES,
    });
    // Explicit metric list wins; legacy useRagas falls back to its profile.
    this.metrics =
      opts.metrics && opts.metrics.length > 0
        ? sanitizeMetricKeys(opts.metrics)
        : getProfile(opts.useRagas ? "conversational_rag" : "conversational")!.metrics;
    this.threshold = opts.satisfactoryThreshold ?? 0.7;
  }

  async runTest(opts: AutonomousRunOptions): Promise<AutonomousTestResult> {
    const start = Date.now();
    const {
      testingPrompt,
      maxTurns,
      sessionId,
      io,
      abort,
      widgetClient,
      enableEvaluation = false,
    } = opts;

    const conversation: AutonomousConversation[] = [];
    const turnEvaluations: Record<string, unknown>[] = [];
    let conversationId = widgetClient.conversationManager?.conversationId ?? null;

    const systemPrompt =
      `You are an autonomous testing agent for a customer support chatbot. Your goal is to ` +
      `conduct a realistic multi-turn conversation to test the chatbot's capabilities.\n\n` +
      `Testing Instructions:\n${testingPrompt}\n\n` +
      `Your responsibilities:\n` +
      `1. Generate realistic user questions based on the testing prompt\n` +
      `2. Follow up on responses naturally, like a real customer would\n` +
      `3. Ask clarifying questions when responses are vague\n` +
      `4. Test edge cases and challenging scenarios\n` +
      `5. Vary your questioning style (simple, complex, ambiguous)\n` +
      `6. Keep the conversation flowing naturally\n\n` +
      `Generate ONE question at a time. Make it realistic and relevant to the testing goals.`;

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];

    const emitConvUpdate = (status: AutonomousTestResult["status"]) => {
      io.to(sessionId).emit("autonomous_conversation_update", {
        totalTurns: conversation.filter((m) => m.role === "user").length,
        duration: (Date.now() - start) / 1000,
        conversationId,
        conversation,
        testingPrompt,
        status,
      });
    };

    for (let turn = 1; turn <= maxTurns; turn++) {
      if (abort.aborted) break;

      let question = "Could not generate question";
      try {
        const response = await this.anthropic.messages.create({
          model: FIXED_MODEL,
          max_tokens: 500,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            {
              role: "user",
              content:
                `Generate the next question for turn ${turn}/${maxTurns}. ` +
                `Consider the conversation so far and the testing goals. ` +
                `Return ONLY the question, nothing else.`,
            },
          ],
        });
        for (const block of response.content) {
          if (block.type === "text") {
            question = block.text.trim();
            break;
          }
        }
      } catch (err) {
        console.warn(`[autonomous] question generation failed at turn ${turn}:`, err);
      }

      const ts = () => new Date().toISOString();
      conversation.push({ role: "user", content: question, timestamp: ts(), turnNumber: turn });
      history.push({ role: "user", content: question });

      io.to(sessionId).emit("autonomous_turn_update", { turn });
      emitConvUpdate("running");

      // Reconnect the widget client if needed.
      if (!widgetClient.isConnected()) {
        try {
          if (!(await widgetClient.connect())) {
            const failText = "No response (connection failed)";
            conversation.push({ role: "assistant", content: failText, timestamp: ts(), turnNumber: turn });
            history.push({ role: "assistant", content: failText });
            emitConvUpdate("running");
            await abortableSleep(1_000, abort);
            continue;
          }
          conversationId = widgetClient.conversationManager?.conversationId ?? conversationId;
        } catch (err) {
          const failText = `No response (reconnection error: ${(err as Error).message})`;
          conversation.push({ role: "assistant", content: failText, timestamp: ts(), turnNumber: turn });
          history.push({ role: "assistant", content: failText });
          emitConvUpdate("running");
          await abortableSleep(1_000, abort);
          continue;
        }
      }

      const responseText =
        (await withTimeout(
          widgetClient.sendMessage(question),
          TURN_WIDGET_TIMEOUT_MS,
          `widget turn ${turn}`,
        ).catch(() => null)) ?? "No response";

      let evaluation: Record<string, unknown> | null = null;
      if (enableEvaluation && responseText && responseText !== "No response") {
        try {
          evaluation = await this.evaluateTurn(question, responseText, history);
          turnEvaluations.push(evaluation);
        } catch (err) {
          console.warn(`[autonomous] turn evaluation failed:`, err);
        }
      }

      conversation.push({
        role: "assistant",
        content: responseText,
        timestamp: ts(),
        turnNumber: turn,
        evaluation: evaluation as unknown as AutonomousConversation["evaluation"],
      });
      history.push({ role: "assistant", content: responseText });
      emitConvUpdate("running");

      await abortableSleep(1_000, abort);
    }

    const duration = (Date.now() - start) / 1000;
    const status: AutonomousTestResult["status"] = abort.aborted ? "stopped" : "completed";
    const result: AutonomousTestResult = {
      totalTurns: conversation.filter((m) => m.role === "user").length,
      duration,
      conversationId,
      conversation,
      testingPrompt,
      status,
    };

    if (enableEvaluation && turnEvaluations.length > 0) {
      const satisfactoryTurns = turnEvaluations.filter((e) => e.is_satisfactory).length;
      const avgScore =
        turnEvaluations.reduce((s, e) => s + (Number(e.overall_score) || 0), 0) / turnEvaluations.length;
      const metricsAverages: Partial<EvaluationMetrics> = {};
      const sums: Record<string, { total: number; count: number }> = {};
      for (const e of turnEvaluations) {
        const m = (e.metrics ?? {}) as Record<string, number>;
        for (const [k, v] of Object.entries(m)) {
          if (typeof v !== "number") continue;
          if (!sums[k]) sums[k] = { total: 0, count: 0 };
          sums[k].total += v;
          sums[k].count += 1;
        }
      }
      for (const [k, { total, count }] of Object.entries(sums)) {
        if (count > 0) (metricsAverages as Record<string, number>)[k] = total / count;
      }
      result.overallEvaluation = {
        averageScore: avgScore,
        metricsAverages,
        satisfactoryTurns,
        totalEvaluatedTurns: turnEvaluations.length,
      };
    }

    return result;
  }

  private async evaluateTurn(
    userMessage: string,
    assistantResponse: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<Record<string, unknown>> {
    const last = history.slice(-6);
    const context = last
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    // Metric instructions + JSON shape come from the shared registry, so the
    // autonomous evaluator scores exactly the same definitions as TestPilot.
    const metricsBlock = `Bewerte die Antwort des Assistenten auf einer Skala von 0.0 bis 1.0 für jede Metrik:

${buildMetricInstructions(this.metrics, "de")}

Antworte im folgenden JSON-Format:
{"metrics": ${buildMetricsJsonShape(this.metrics).replace(/\s+/g, " ")}, "evaluation": "...", "reasoning": "..."}`;

    const evaluationPrompt = `Bewerte die Antwort des Assistenten in diesem laufenden Gespräch:

Gesprächsverlauf:
${context}

Aktueller Austausch:
User: ${userMessage}
Assistant: ${assistantResponse}

${metricsBlock}`;

    try {
      const response = await this.anthropic.messages.create({
        model: FIXED_MODEL,
        max_tokens: 1000,
        // Same evaluator system prompt across every turn — cache it.
        system: [
          {
            type: "text",
            text:
              "Du bist ein KI-Evaluator für Chat-Konversationen. " +
              "Antworte immer im angeforderten JSON-Format.",
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: evaluationPrompt }],
        temperature: 0.3,
      });

      let text = "";
      for (const block of response.content) {
        if (block.type === "text") {
          text = block.text;
          break;
        }
      }
      // Strip markdown fences if Claude decides to wrap the JSON.
      const fenceJson = /```json\s*([\s\S]*?)\s*```/m.exec(text);
      if (fenceJson) text = fenceJson[1];
      const fenceAny = /```\s*([\s\S]*?)\s*```/m.exec(text);
      if (fenceAny && !fenceJson) text = fenceAny[1];
      if (!text) throw new Error("Empty evaluation response");
      const parsed = JSON.parse(text) as { metrics?: RawMetrics; evaluation?: string; reasoning?: string };
      const metrics = coerceSelectedMetrics(parsed.metrics ?? {}, this.metrics);
      return buildEvaluationResultDict({
        metrics,
        evaluation: parsed.evaluation ?? "",
        reasoning: parsed.reasoning ?? "",
        evaluatorModel: FIXED_MODEL,
        threshold: this.threshold,
      });
    } catch (err) {
      console.warn("[autonomous] turn evaluation error:", err);
      return errorEvaluationDict(
        `Evaluation error: ${(err as Error).message}`,
        "Could not evaluate response due to an error",
        FIXED_MODEL,
      );
    }
  }
}
