import { generateQAExcel } from "@/lib/exports/excel";
import type { QATestResults } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as QATestResults;
    if (!data) return Response.json({ error: "No data provided" }, { status: 400 });
    const xlsx = await generateQAExcel(data);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    return new Response(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="qa_test_results_${stamp}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: `Failed to generate Excel: ${(err as Error).message}` }, { status: 500 });
  }
}
