/**
 * Evaluation prompt templates.
 *
 * The metric instructions are generated from the metric registry
 * (lib/agents/metrics.ts) so prompts, tool schema, and UI always agree on
 * which metrics a run scores. The legacy fixed templates remain exported
 * because operators may have saved them as custom overrides.
 */
import { buildMetricInstructions, buildMetricsJsonShape } from "./metrics";

export interface PromptConfigInit {
  language?: "de" | "en";
  systemPrompt?: string;
  evaluationTemplate?: string;
  satisfactoryThreshold?: number;
}

export class EvaluationPromptConfig {
  language: "de" | "en";
  systemPrompt: string | null;
  evaluationTemplate: string | null;
  satisfactoryThreshold: number;

  constructor(init: PromptConfigInit = {}) {
    this.language = init.language ?? "de";
    this.systemPrompt = init.systemPrompt ?? null;
    this.evaluationTemplate = init.evaluationTemplate ?? null;
    this.satisfactoryThreshold = init.satisfactoryThreshold ?? 0.7;
  }
}

export const DEFAULT_SYSTEM_PROMPT_DE =
  "Du bist ein KI-Evaluator für Chat-Widget-Antworten.\n" +
  "Deine Aufgabe ist es, Antworten objektiv und fair zu bewerten.\n" +
  "Antworte immer im angeforderten JSON-Format.";

export const DEFAULT_SYSTEM_PROMPT_EN =
  "You are an AI evaluator for chat widget responses.\n" +
  "Your task is to evaluate responses objectively and fairly.\n" +
  "Always respond in the requested JSON format.";

export const DEFAULT_EVALUATION_PROMPT_DE = `Bewerte die folgende Antwort eines Chat-Widgets anhand mehrerer Metriken:

Frage: {question}

Erwartete Antwort: {expected}

Tatsächliche Antwort: {actual}

Bewerte die tatsächliche Antwort auf einer Skala von 0.0 bis 1.0 für jede Metrik:

1. RELEVANCE (Relevanz): Wie relevant ist die Antwort zur Frage?
2. ACCURACY (Genauigkeit): Ist die Information sachlich korrekt?
3. COMPLETENESS (Vollständigkeit): Deckt sie alle notwendigen Punkte ab?
4. HELPFULNESS (Hilfreichkeit): Ist sie nützlich und umsetzbar?
5. COHERENCE (Kohärenz): Ist sie gut strukturiert und klar?

Antworte im folgenden JSON-Format:
{
    "metrics": {
        "relevance": 0.0-1.0,
        "accuracy": 0.0-1.0,
        "completeness": 0.0-1.0,
        "helpfulness": 0.0-1.0,
        "coherence": 0.0-1.0
    },
    "evaluation": "Kurze Zusammenfassung (1-2 Sätze)",
    "reasoning": "Detaillierte Begründung für jede Metrik"
}`;

export const DEFAULT_EVALUATION_PROMPT_EN = `Evaluate the following chat widget response using multiple metrics:

Question: {question}

Expected Answer: {expected}

Actual Response: {actual}

Rate the actual response on a scale of 0.0 to 1.0 for each metric:

1. RELEVANCE: How relevant is the response to the question?
2. ACCURACY: Is the information factually correct?
3. COMPLETENESS: Does it cover all necessary points?
4. HELPFULNESS: Is it useful and actionable?
5. COHERENCE: Is it well-structured and clear?

Respond in the following JSON format:
{
    "metrics": {
        "relevance": 0.0-1.0,
        "accuracy": 0.0-1.0,
        "completeness": 0.0-1.0,
        "helpfulness": 0.0-1.0,
        "coherence": 0.0-1.0
    },
    "evaluation": "Brief summary (1-2 sentences)",
    "reasoning": "Detailed reasoning for each metric"
}`;

export const RAGAS_EVALUATION_PROMPT_DE = `Bewerte die folgende Antwort eines Chat-Widgets anhand erweiterter RAGAS-Metriken:

Frage: {question}

Erwartete Antwort (Kontext): {expected}

Tatsächliche Antwort: {actual}

Bewerte die tatsächliche Antwort auf einer Skala von 0.0 bis 1.0 für jede Metrik:

KERN-METRIKEN:
1. RELEVANCE (Relevanz): Wie relevant ist die Antwort zur Frage?
2. ACCURACY (Genauigkeit): Ist die Information sachlich korrekt?
3. COMPLETENESS (Vollständigkeit): Deckt sie alle notwendigen Punkte ab?
4. HELPFULNESS (Hilfreichkeit): Ist sie nützlich und umsetzbar?
5. COHERENCE (Kohärenz): Ist sie gut strukturiert und klar?

RAGAS-METRIKEN:
6. FAITHFULNESS (Treue): Wie konsistent ist die Antwort mit der erwarteten Antwort?
7. ANSWER_RELEVANCY (Antwort-Relevanz): Wie gut adressiert die Antwort die Frage?

Antworte im folgenden JSON-Format:
{
    "metrics": {
        "relevance": 0.0-1.0,
        "accuracy": 0.0-1.0,
        "completeness": 0.0-1.0,
        "helpfulness": 0.0-1.0,
        "coherence": 0.0-1.0,
        "faithfulness": 0.0-1.0,
        "answer_relevancy": 0.0-1.0
    },
    "evaluation": "Kurze Zusammenfassung (1-2 Sätze)",
    "reasoning": "Detaillierte Begründung für jede Metrik"
}`;

export const RAGAS_EVALUATION_PROMPT_EN = `Evaluate the following chat widget response using extended RAGAS metrics:

Question: {question}

Expected Answer (Context): {expected}

Actual Response: {actual}

Rate the actual response on a scale of 0.0 to 1.0 for each metric:

CORE METRICS:
1. RELEVANCE: How relevant is the response to the question?
2. ACCURACY: Is the information factually correct?
3. COMPLETENESS: Does it cover all necessary points?
4. HELPFULNESS: Is it useful and actionable?
5. COHERENCE: Is it well-structured and clear?

RAGAS METRICS:
6. FAITHFULNESS: How consistent is the response with the expected answer?
7. ANSWER_RELEVANCY: How well does the answer address the question?

Respond in the following JSON format:
{
    "metrics": {
        "relevance": 0.0-1.0,
        "accuracy": 0.0-1.0,
        "completeness": 0.0-1.0,
        "helpfulness": 0.0-1.0,
        "coherence": 0.0-1.0,
        "faithfulness": 0.0-1.0,
        "answer_relevancy": 0.0-1.0
    },
    "evaluation": "Brief summary (1-2 sentences)",
    "reasoning": "Detailed reasoning for each metric"
}`;

export function getSystemPrompt(config: EvaluationPromptConfig): string {
  if (config.systemPrompt) return config.systemPrompt;
  return config.language === "en" ? DEFAULT_SYSTEM_PROMPT_EN : DEFAULT_SYSTEM_PROMPT_DE;
}

/**
 * Generic skeletons: the metric instructions and JSON shape are generated
 * from the selected metric set (lib/agents/metrics.ts) instead of being
 * baked into per-variant templates.
 */
const GENERIC_SKELETON_DE = `Bewerte die folgende Antwort eines Chat-Widgets anhand der unten definierten Metriken:

Frage: {question}

Erwartete Antwort (Referenz): {expected}

Tatsächliche Antwort: {actual}

Bewerte die tatsächliche Antwort auf einer Skala von 0.0 bis 1.0 für jede Metrik:

{metrics_block}

Antworte im folgenden JSON-Format:
{
    "metrics": {metrics_json},
    "evaluation": "Kurze Zusammenfassung (1-2 Sätze)",
    "reasoning": "Detaillierte Begründung für jede Metrik"
}`;

const GENERIC_SKELETON_EN = `Evaluate the following chat widget response using the metrics defined below:

Question: {question}

Expected Answer (reference): {expected}

Actual Response: {actual}

Rate the actual response on a scale of 0.0 to 1.0 for each metric:

{metrics_block}

Respond in the following JSON format:
{
    "metrics": {metrics_json},
    "evaluation": "Brief summary (1-2 sentences)",
    "reasoning": "Detailed reasoning for each metric"
}`;

export function getEvaluationPrompt(args: {
  config: EvaluationPromptConfig;
  question: string;
  expected: string;
  actual: string;
  /** Selected metric keys (see lib/agents/metrics.ts). Required for the generic skeleton. */
  metrics: string[];
}): string {
  const { config, question, expected, actual, metrics } = args;
  // A custom template wins (operator-authored); it may use {metrics_block} /
  // {metrics_json} to inherit the selected metric set, or spell out its own.
  const template =
    config.evaluationTemplate ??
    (config.language === "en" ? GENERIC_SKELETON_EN : GENERIC_SKELETON_DE);
  return template
    .replaceAll("{metrics_block}", buildMetricInstructions(metrics, config.language))
    .replaceAll("{metrics_json}", buildMetricsJsonShape(metrics))
    .replaceAll("{question}", question)
    .replaceAll("{expected}", expected)
    .replaceAll("{actual}", actual);
}

export function defaultPromptConfigPayload(): Record<string, unknown> {
  return {
    language: "de",
    metrics: ["relevance", "accuracy", "completeness", "helpfulness", "coherence"],
    satisfactory_threshold: 0.7,
    system_prompt: DEFAULT_SYSTEM_PROMPT_DE,
    evaluation_template: DEFAULT_EVALUATION_PROMPT_DE,
    available_templates: {
      default_de: {
        name: "Standard (Deutsch)",
        system_prompt: DEFAULT_SYSTEM_PROMPT_DE,
        evaluation_template: DEFAULT_EVALUATION_PROMPT_DE,
      },
      default_en: {
        name: "Standard (English)",
        system_prompt: DEFAULT_SYSTEM_PROMPT_EN,
        evaluation_template: DEFAULT_EVALUATION_PROMPT_EN,
      },
      ragas_de: {
        name: "RAGAS Extended (Deutsch)",
        system_prompt: DEFAULT_SYSTEM_PROMPT_DE,
        evaluation_template: RAGAS_EVALUATION_PROMPT_DE,
      },
      ragas_en: {
        name: "RAGAS Extended (English)",
        system_prompt: DEFAULT_SYSTEM_PROMPT_EN,
        evaluation_template: RAGAS_EVALUATION_PROMPT_EN,
      },
    },
  };
}
