/**
 * GET  /api/configs — list shared widget configs.
 * POST /api/configs — upsert one (name is the key).
 */
import { z, ZodError } from "zod";

import { listConfigs, upsertConfig } from "@/lib/repos/configs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const httpUrl = z
  .string()
  .min(1)
  .max(2_048)
  .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
    message: "must start with http:// or https://",
  });

const UpsertConfigPayload = z.object({
  name: z.string().trim().min(1).max(256),
  widgetId: z.string().min(1).max(256),
  baseUrl: httpUrl,
  origin: httpUrl,
  referer: httpUrl,
});

export async function GET() {
  return Response.json({ configs: listConfigs() });
}

export async function POST(request: Request) {
  try {
    const payload = UpsertConfigPayload.parse(await request.json());
    return Response.json({ config: upsertConfig(payload) }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : "Invalid JSON";
    return Response.json({ error: message }, { status: 400 });
  }
}
