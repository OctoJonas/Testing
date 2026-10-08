/** DELETE /api/configs/:name — remove a shared widget config. */
import { deleteConfig } from "@/lib/repos/configs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!deleteConfig(decodeURIComponent(name))) {
    return Response.json({ error: "Config not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
