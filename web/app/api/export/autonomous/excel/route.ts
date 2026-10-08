import { generateAutonomousExcel } from "@/lib/exports/excel";
import type { AutonomousTestResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as AutonomousTestResult;
    if (!data) return Response.json({ error: "No data provided" }, { status: 400 });
    const xlsx = await generateAutonomousExcel(data);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    return new Response(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="autonomous_test_${stamp}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: `Failed to generate Excel: ${(err as Error).message}` }, { status: 500 });
  }
}
