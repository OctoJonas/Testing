/**
 * GET  /api/suites — list suite summaries.
 * POST /api/suites — create (or overwrite-by-name) a suite.
 */
import { ZodError } from "zod";

import { CreateSuitePayload } from "@/lib/schemas/suites";
import { createSuite, findSuiteByName, listSuites, updateSuite } from "@/lib/repos/suites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ suites: listSuites() });
}

export async function POST(request: Request) {
  let payload: CreateSuitePayload;
  try {
    payload = CreateSuitePayload.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : "Invalid JSON";
    return Response.json({ error: message }, { status: 400 });
  }

  const existing = findSuiteByName(payload.name);
  if (existing && !payload.overwrite) {
    return Response.json(
      { error: `A suite named "${payload.name}" already exists.`, existingId: existing.id },
      { status: 409 },
    );
  }

  const suite = existing
    ? updateSuite(existing.id, { fileName: payload.fileName, pairs: payload.pairs })
    : createSuite({ name: payload.name, fileName: payload.fileName, pairs: payload.pairs });
  return Response.json({ suite }, { status: existing ? 200 : 201 });
}
