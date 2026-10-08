/**
 * POST /api/runs — persist a completed run (client-driven so retry-merged
 * reports are stored in their final form).
 */
import { ZodError } from "zod";

import { SaveRunPayload } from "@/lib/schemas/suites";
import { getSuite } from "@/lib/repos/suites";
import { saveRun } from "@/lib/repos/runs";
import type { QATestResults } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: SaveRunPayload;
  try {
    payload = SaveRunPayload.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : "Invalid JSON";
    return Response.json({ error: message }, { status: 400 });
  }
  if (!getSuite(payload.suite_id)) {
    return Response.json({ error: "Suite not found" }, { status: 404 });
  }
  const run = saveRun({
    suiteId: payload.suite_id,
    configName: payload.config_name,
    results: payload.results as unknown as QATestResults,
  });
  return Response.json({ run }, { status: 201 });
}
