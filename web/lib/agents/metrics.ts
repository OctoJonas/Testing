/**
 * Single source of truth for evaluation metrics and profiles.
 *
 * Everything downstream derives from this registry: the evaluator prompt's
 * metric instructions, the Anthropic tool schema (which forces the model to
 * return exactly the selected metrics — no more invented scores), the
 * /api/evaluation/config payload, and the metric-picker UI.
 *
 * Honesty note: this app never sees the widget's retrieved contexts (the
 * protocol exposes only the answer text), so true RAGAS context metrics
 * (context_precision/context_recall) are NOT measurable and are not
 * selectable. The "RAG" profile uses reference-based approximations judged
 * against the expected answer.
 */

export type MetricGroup = "core" | "rag" | "conversational" | "style";

export interface MetricDef {
  key: string;
  label: string;
  group: MetricGroup;
  /** Instruction shown to the evaluator model. */
  de: string;
  en: string;
}

export const METRIC_REGISTRY: readonly MetricDef[] = [
  // Core answer quality
  { key: "relevance", label: "Relevance", group: "core",
    de: "Wie relevant ist die Antwort zur gestellten Frage?",
    en: "How relevant is the response to the question asked?" },
  { key: "accuracy", label: "Accuracy", group: "core",
    de: "Ist die Information sachlich korrekt (gemessen an der erwarteten Antwort)?",
    en: "Is the information factually correct (judged against the expected answer)?" },
  { key: "completeness", label: "Completeness", group: "core",
    de: "Deckt die Antwort alle notwendigen Punkte der erwarteten Antwort ab?",
    en: "Does the response cover all necessary points of the expected answer?" },
  { key: "helpfulness", label: "Helpfulness", group: "core",
    de: "Ist die Antwort nützlich und umsetzbar?",
    en: "Is the response useful and actionable?" },
  { key: "coherence", label: "Coherence", group: "core",
    de: "Ist die Antwort gut strukturiert und klar?",
    en: "Is the response well-structured and clear?" },

  // Reference-based RAG quality (approximations — no retrieved contexts available)
  { key: "faithfulness", label: "Faithfulness", group: "rag",
    de: "Sind alle Behauptungen in der Antwort durch die erwartete Antwort gedeckt (keine erfundenen Fakten)?",
    en: "Are all claims in the response supported by the expected answer (no invented facts)?" },
  { key: "answer_relevancy", label: "Answer Relevancy", group: "rag",
    de: "Adressiert die Antwort direkt die Frage, ohne abzuschweifen oder auszuweichen?",
    en: "Does the answer directly address the question without digressing or deflecting?" },
  { key: "specificity", label: "Specificity", group: "rag",
    de: "Nennt die Antwort konkrete Schritte, Namen und Werte statt Allgemeinplätzen?",
    en: "Does the response give concrete steps, names and values rather than generalities?" },
  { key: "clarity", label: "Clarity", group: "rag",
    de: "Ist die Antwort leicht verständlich?",
    en: "Is the response easy to understand?" },

  // Conversational (multi-turn / autonomous runs)
  { key: "context_retention", label: "Context Retention", group: "conversational",
    de: "Nutzt die Antwort den bisherigen Gesprächsverlauf angemessen?",
    en: "Does the response use the conversation history appropriately?" },
  { key: "natural_flow", label: "Natural Flow", group: "conversational",
    de: "Wirkt die Antwort natürlich im Gesprächsfluss?",
    en: "Does the response feel natural in the conversation flow?" },
  { key: "consistency", label: "Consistency", group: "conversational",
    de: "Ist die Antwort konsistent mit früheren Aussagen im Gespräch?",
    en: "Is the response consistent with earlier statements in the conversation?" },

  // Style & safety
  { key: "safety", label: "Safety", group: "style",
    de: "Enthält die Antwort keine schädlichen oder unangemessenen Inhalte?",
    en: "Is the response free of harmful or inappropriate content?" },
  { key: "tone_appropriateness", label: "Tone", group: "style",
    de: "Ist der Ton professionell und empathisch?",
    en: "Is the tone professional and empathetic?" },
] as const;

const BY_KEY = new Map(METRIC_REGISTRY.map((m) => [m.key, m]));

export interface MetricProfile {
  key: string;
  name: string;
  description: string;
  /** Which testing mode(s) the profile is meant for. */
  context: "qa" | "autonomous" | "both";
  metrics: string[];
}

const CORE = ["relevance", "accuracy", "completeness", "helpfulness", "coherence"];

export const METRIC_PROFILES: readonly MetricProfile[] = [
  {
    key: "core",
    name: "Core (5 metrics)",
    description: "Answer quality vs. the expected answer — fast and cheap.",
    context: "qa",
    metrics: CORE,
  },
  {
    key: "rag",
    name: "RAG Quality — reference-based (9 metrics)",
    description:
      "Core plus hallucination and groundedness checks judged against the expected answer. " +
      "(True RAGAS context metrics need the widget's retrieved sources, which the protocol doesn't expose.)",
    context: "qa",
    metrics: [...CORE, "faithfulness", "answer_relevancy", "specificity", "clarity"],
  },
  {
    key: "conversational",
    name: "Conversational (6 metrics)",
    description: "Multi-turn quality: flow, consistency and context use across the conversation.",
    context: "autonomous",
    metrics: ["relevance", "helpfulness", "coherence", "context_retention", "natural_flow", "consistency"],
  },
  {
    key: "conversational_rag",
    name: "Conversational + RAG (8 metrics)",
    description: "Conversational metrics plus faithfulness and answer relevancy per turn.",
    context: "autonomous",
    metrics: [
      "relevance", "helpfulness", "coherence", "context_retention", "natural_flow",
      "consistency", "faithfulness", "answer_relevancy",
    ],
  },
] as const;

export function getProfile(key: string): MetricProfile | undefined {
  return METRIC_PROFILES.find((p) => p.key === key);
}

/** Drop unknown keys, dedupe, keep registry order. Empty → core profile. */
export function sanitizeMetricKeys(keys: string[] | undefined | null): string[] {
  const wanted = new Set((keys ?? []).filter((k) => BY_KEY.has(k)));
  const ordered = METRIC_REGISTRY.filter((m) => wanted.has(m.key)).map((m) => m.key);
  return ordered.length > 0 ? ordered : [...CORE];
}

/**
 * Resolve the metric set for a run. Priority: explicit `metrics` list →
 * legacy `use_ragas` flag → core profile.
 */
export function resolveMetrics(opts: { metrics?: string[]; use_ragas?: boolean } = {}): string[] {
  if (opts.metrics && opts.metrics.length > 0) return sanitizeMetricKeys(opts.metrics);
  if (opts.use_ragas) return getProfile("rag")!.metrics;
  return [...CORE];
}

/** Numbered instruction block for the evaluator prompt. */
export function buildMetricInstructions(keys: string[], language: "de" | "en"): string {
  const lines = keys.map((k, i) => {
    const def = BY_KEY.get(k)!;
    return `${i + 1}. ${def.key.toUpperCase()}: ${language === "de" ? def.de : def.en}`;
  });
  return lines.join("\n");
}

/** JSON shape hint listing exactly the selected metric keys. */
export function buildMetricsJsonShape(keys: string[]): string {
  return `{\n${keys.map((k) => `        "${k}": 0.0-1.0`).join(",\n")}\n    }`;
}

/**
 * Anthropic tool input_schema for exactly the selected metrics. Every
 * selected metric is required; nothing else is allowed — the model can't
 * invent scores for metrics nobody asked about.
 */
export function buildEvaluationToolSchema(keys: string[]): {
  type: "object";
  required: string[];
  properties: Record<string, unknown>;
} {
  const metricProps: Record<string, unknown> = {};
  for (const k of keys) metricProps[k] = { type: "number", minimum: 0, maximum: 1 };
  return {
    type: "object" as const,
    required: ["metrics", "evaluation", "reasoning"],
    properties: {
      metrics: {
        type: "object" as const,
        required: keys,
        properties: metricProps,
        additionalProperties: false,
      },
      evaluation: { type: "string" },
      reasoning: { type: "string" },
    },
  };
}
