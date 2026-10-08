/**
 * GET    /api/runs/:id — full stored results for one run.
 * DELETE /api/runs/:id — remove a run from history.
 */
import { deleteRun, getRunResults } from "@/lib/repos/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const results = getRunResults(id);
  if (!results) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({ results });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!deleteRun(id)) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({ ok: true });
}
