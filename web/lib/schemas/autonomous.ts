/**
 * Inbound autonomous-test payloads.
 */
import { z } from "zod";

export const StartAutonomousTestPayload = z.object({
  testingPrompt: z.string().min(1).max(4_000),
  maxTurns: z.number().int().min(1).max(100),
  enableEvaluation: z.boolean().optional().default(false),
  /** Selected per-turn metric keys — unknown keys are dropped server-side. */
  metrics: z.array(z.string().max(64)).max(20).optional(),
  /** Legacy flag; maps to the conversational_rag profile when `metrics` is absent. */
  useRagas: z.boolean().optional(),
  satisfactoryThreshold: z.number().min(0).max(1).optional(),
  // Same backward-compat note as start_qa_test.
  apiKey: z.string().optional(),
});
export type StartAutonomousTestPayload = z.infer<typeof StartAutonomousTestPayload>;
