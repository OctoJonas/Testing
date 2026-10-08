/**
 * Inbound chat-handler payloads.
 */
import { z } from "zod";

const MESSAGE_MAX = 8_000;

export const SendMessagePayload = z.object({
  message: z.string().min(1).max(MESSAGE_MAX),
  _context: z.string().min(1).max(64).optional(),
});
export type SendMessagePayload = z.infer<typeof SendMessagePayload>;
