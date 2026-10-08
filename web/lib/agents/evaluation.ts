/**
 * Evaluation models — port of testing/backend/models/evaluation.py.
 *
 * 0-1 internal scale, 0-100 only for display. Mirrors the dict shape that
 * the React frontend already consumes today, so once the new server takes
 * over, the UI doesn't need a single line of change to render results.
 */

import type { EvaluationMetrics } from "../types";

const ALL_METRIC_KEYS = [
  "relevance",
  "accuracy",
  "completeness",
  "helpfulness",
  "coherence",
  "faithfulness",
  "answer_relevancy",
  "context_precision",
  "context_recall",
  "clarity",
  "specificity",
  "context_retention",
  "consistency",
  "natural_flow",
  "safety",
  "tone_appropriateness",
] as const;
export type MetricKey = (typeof ALL_METRIC_KEYS)[number];

export const METRIC_DESCRIPTIONS: Record<MetricKey, string> = {
  relevance: "How relevant is the response to the question",
  accuracy: "Factual correctness of the information",
  completeness: "Covers all necessary points",
  helpfulness: "Actionable and useful information",
  coherence: "Well-structured and clear response",
  faithfulness: "Factual consistency with expected answer (RAGAS)",
  answer_relevancy: "How well answer addresses the question (RAGAS)",
  context_precision: "Precision of context usage (RAGAS)",
  context_recall: "Recall of relevant context (RAGAS)",
  clarity: "Easy to understand",
  specificity: "Level of detail provided",
  context_retention: "Uses conversation history appropriately",
  consistency: "No contradictions in response",
  natural_flow: "Conversation naturalness",
  safety: "No harmful content",
  tone_appropriateness: "Professional and empathetic tone",
};

export const AVAILABLE_METRICS: MetricKey[] = [...ALL_METRIC_KEYS];

export function activeMetrics(metrics: EvaluationMetrics): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  const bag = metrics as unknown as Record<string, unknown>;
  for (const key of ALL_METRIC_KEYS) {
    const v = bag[key];
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[key] = v;
    }
  }
  return out;
}

export function metricsTo100(metrics: EvaluationMetrics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(activeMetrics(metrics))) {
    if (typeof v === "number") out[k] = Math.round(v * 100);
  }
  return out;
}

export function computeOverallScore(
  metrics: EvaluationMetrics,
  weights?: Partial<Record<MetricKey, number>>,
): number {
  const active = activeMetrics(metrics);
  const entries = Object.entries(active) as [MetricKey, number][];
  if (entries.length === 0) return 0;
  if (!weights) {
    return entries.reduce((sum, [, v]) => sum + v, 0) / entries.length;
  }
  let weightSum = 0;
  let weightedTotal = 0;
  for (const [k, v] of entries) {
    const w = weights[k] ?? 1;
    weightedTotal += v * w;
    weightSum += w;
  }
  return weightSum > 0 ? weightedTotal / weightSum : 0;
}

export function isSatisfactory(overallScore: number, threshold = 0.7): boolean {
  return overallScore >= threshold;
}

/** Build the v2.0 result dict the frontend expects. */
export function buildEvaluationResultDict(args: {
  metrics: EvaluationMetrics;
  evaluation: string;
  reasoning: string;
  evaluatorModel: string;
  threshold?: number;
}): Record<string, unknown> {
  const { metrics, evaluation, reasoning, evaluatorModel, threshold = 0.7 } = args;
  const overall = Math.max(0, Math.min(1, computeOverallScore(metrics)));
  return {
    metrics: activeMetrics(metrics),
    scores: metricsTo100(metrics),
    overall_score: overall,
    overall_score_100: Math.round(overall * 100),
    is_satisfactory: isSatisfactory(overall, threshold),
    evaluation,
    reasoning,
    metadata: {
      evaluator: evaluatorModel,
      timestamp: new Date().toISOString(),
      evaluation_version: "2.0",
    },
    score: Math.round(overall * 100),
  };
}

export function errorEvaluationDict(
  evaluation: string,
  reasoning: string,
  evaluatorModel: string,
): Record<string, unknown> {
  return buildEvaluationResultDict({
    metrics: { relevance: 0, accuracy: 0, completeness: 0, helpfulness: 0, coherence: 0 },
    evaluation,
    reasoning,
    evaluatorModel,
  });
}
