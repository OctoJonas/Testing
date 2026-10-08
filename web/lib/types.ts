/**
 * Shared types ported from frontend/src/types/index.ts. Keeping them in
 * `lib/` so server-side code (handlers, agents) and client components share
 * one source of truth.
 */

/**
 * Wire shape for the `configure` event payload — `createdAt`/`updatedAt` are
 * not transmitted, only stored locally.
 */
export interface ConfigInput {
  name: string;
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Persisted config in the browser's localStorage. Always has createdAt.
 */
export interface Config {
  name: string;
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface QAPair {
  Frage: string;
  Antwort: string;
}

export interface EvaluationMetrics {
  relevance: number;
  accuracy: number;
  completeness: number;
  helpfulness: number;
  coherence: number;
  faithfulness?: number;
  answer_relevancy?: number;
  context_precision?: number;
  context_recall?: number;
  clarity?: number;
  specificity?: number;
  context_retention?: number;
  consistency?: number;
  natural_flow?: number;
  safety?: number;
  tone_appropriateness?: number;
}

export interface EvaluationMetadata {
  evaluator: string;
  timestamp: string;
  evaluation_version: string;
}

export interface EvaluationResult {
  metrics: EvaluationMetrics;
  overall_score: number; // 0-1
  is_satisfactory: boolean;
  evaluation: string;
  reasoning: string;
  metadata?: EvaluationMetadata;
  score?: number; // legacy 0-100
}

export interface QATestResult extends EvaluationResult {
  index: number;
  question: string;
  expected_answer: string;
  actual_response: string;
  conversation_id?: string;
  context?: string;
  /** "answered" | "widget_error" | "no_response" — infra failures aren't bot answers. */
  status?: string;
  /** Widget round-trip for this question, in ms. */
  response_time_ms?: number;
}

export interface QATestResults {
  total: number;
  satisfactory: number;
  failed: number;
  /** Of `failed`, how many never got a real answer (widget/backend failure). */
  infrastructure_errors?: number;
  /** Pass threshold (0-1) the evaluator used — makes reports self-describing. */
  threshold?: number;
  /** Widget round-trip stats over answered questions. */
  latency?: { median_ms: number; p95_ms: number; max_ms: number } | null;
  results: QATestResult[];
  model: string;
  timestamp: string;
  completed?: number;
}

export interface AutonomousConversation {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  turnNumber: number;
  evaluation?: EvaluationResult;
}

export interface AutonomousTestResult {
  totalTurns: number;
  duration: number;
  conversationId: string | null;
  conversation: AutonomousConversation[];
  testingPrompt: string;
  status: "running" | "completed" | "stopped" | "error";
  error?: string;
  overallEvaluation?: {
    averageScore: number;
    metricsAverages: Partial<EvaluationMetrics>;
    satisfactoryTurns: number;
    totalEvaluatedTurns: number;
  };
}

export type TabType = "chat" | "settings" | "testpilot" | "autonomous" | "docs";
