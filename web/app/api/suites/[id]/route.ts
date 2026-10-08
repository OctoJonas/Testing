/**
 * GET    /api/suites/:id — full suite incl. pairs.
 * PUT    /api/suites/:id — rename / replace pairs.
 * DELETE /api/suites/:id — delete suite (run history cascades).
 */
import { ZodError } from "zod";

import { UpdateSuitePayload } from "@/lib/schemas/suites";
import { deleteSuite, getSuite, updateSuite } from "@/lib/repos/suites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const suite = getSuite(id);
  if (!suite) return Response.json({ error: "Suite not found" }, { status: 404 });
  return Response.json({ suite });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let payload: UpdateSuitePayload;
  try {
    payload = UpdateSuitePayload.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : "Invalid JSON";
    return Response.json({ error: message }, { status: 400 });
  }
  const suite = updateSuite(id, payload);
  if (!suite) return Response.json({ error: "Suite not found" }, { status: 404 });
  return Response.json({ suite });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!deleteSuite(id)) return Response.json({ error: "Suite not found" }, { status: 404 });
  return Response.json({ ok: true });
}
