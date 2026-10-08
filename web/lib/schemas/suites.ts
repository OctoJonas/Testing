/** Inbound payloads for the suite + run-history REST routes. */
import { z } from "zod";

import { QAPair } from "./qa";

export const CreateSuitePayload = z.object({
  name: z.string().trim().min(1).max(200),
  fileName: z.string().max(300).nullish(),
  pairs: z.array(QAPair).min(1).max(5_000),
  /** Replace the existing suite of the same name instead of failing with 409. */
  overwrite: z.boolean().optional(),
});
export type CreateSuitePayload = z.infer<typeof CreateSuitePayload>;

export const UpdateSuitePayload = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  fileName: z.string().max(300).nullish(),
  pairs: z.array(QAPair).min(1).max(5_000).optional(),
});
export type UpdateSuitePayload = z.infer<typeof UpdateSuitePayload>;

export const SaveRunPayload = z.object({
  suite_id: z.string().min(1).max(64),
  config_name: z.string().max(200).nullish(),
  // The full QATestResults object; validated loosely — it was produced by
  // this server and round-trips through the client for retry-merging.
  results: z
    .object({
      total: z.number().int().nonnegative(),
      satisfactory: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      results: z.array(z.record(z.string(), z.unknown())).max(10_000),
    })
    .passthrough(),
});
export type SaveRunPayload = z.infer<typeof SaveRunPayload>;
