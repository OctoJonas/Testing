/**
 * Inbound `start_qa_test` payload. Caps mirror the Python validators:
 * up to 5,000 Q&A pairs, 4 KB per question/answer.
 */
import { z } from "zod";

export const QAPair = z.object({
  Frage: z.string().min(1).max(4_000),
  Antwort: z.string().min(1).max(4_000),
});
export type QAPair = z.infer<typeof QAPair>;

export const PromptConfig = z.object({
  language: z.enum(["de", "en"]).optional(),
  system_prompt: z.string().max(8_000).optional(),
  evaluation_template: z.string().max(8_000).optional(),
  satisfactory_threshold: z.number().min(0).max(1).optional(),
  /** Selected metric keys — unknown keys are dropped server-side. */
  metrics: z.array(z.string().max(64)).max(20).optional(),
  /** Legacy flag; maps to the "rag" profile when `metrics` is absent. */
  use_ragas: z.boolean().optional(),
});
export type PromptConfig = z.infer<typeof PromptConfig>;

export const StartQATestPayload = z
  .object({
    qa_pairs: z.array(QAPair).min(1).max(5_000),
    prompt_config: PromptConfig.optional(),
    // Original row numbers when re-running a subset (the "Retry errors"
    // flow): results carry these indices so the client can merge them back
    // into the full report. Must align 1:1 with qa_pairs.
    indices: z.array(z.number().int().nonnegative().max(100_000)).optional(),
    // model + api_key are no longer client-controlled; the backend always uses
    // Claude Sonnet 4 via the ANTHROPIC_API_KEY in .env. We accept these fields
    // for backward compatibility but ignore their values.
    model: z.string().optional(),
    api_key: z.string().optional(),
  })
  .refine((p) => !p.indices || p.indices.length === p.qa_pairs.length, {
    message: "indices must have the same length as qa_pairs",
  });
export type StartQATestPayload = z.infer<typeof StartQATestPayload>;
