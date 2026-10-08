/** GET /api/suites/:id/runs — run summaries for the trend view (newest first). */
import { getSuite } from "@/lib/repos/suites";
import { listRunsForSuite } from "@/lib/repos/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getSuite(id)) return Response.json({ error: "Suite not found" }, { status: 404 });
  return Response.json({ runs: listRunsForSuite(id) });
}
