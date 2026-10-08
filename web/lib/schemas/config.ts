/**
 * Inbound `configure` event payload. Mirrors the validate_configure Python
 * function — same field set, same length caps, same URL prefix check.
 */
import { z } from "zod";

const URL_MAX = 2_048;
const NAME_MAX = 256;

const httpUrl = z
  .string()
  .min(1)
  .max(URL_MAX)
  .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
    message: "must start with http:// or https://",
  });

export const ConfigurePayload = z.object({
  config: z.object({
    widgetId: z.string().min(1).max(NAME_MAX),
    baseUrl: httpUrl,
    origin: httpUrl,
    referer: httpUrl,
  }),
  _context: z.string().min(1).max(64).optional(),
});

export type ConfigurePayload = z.infer<typeof ConfigurePayload>;

export const ContextOnlyPayload = z.object({
  _context: z.string().min(1).max(64).optional(),
});
export type ContextOnlyPayload = z.infer<typeof ContextOnlyPayload>;
