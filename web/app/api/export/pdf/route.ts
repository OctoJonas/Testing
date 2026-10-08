import { generateQAPdf } from "@/lib/exports/pdf";
import type { QATestResults } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as QATestResults;
    if (!data) return Response.json({ error: "No data provided" }, { status: 400 });
    const pdf = await generateQAPdf(data);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="qa_test_results_${stamp}.pdf"`,
      },
    });
  } catch (err) {
    return Response.json({ error: `Failed to generate PDF: ${(err as Error).message}` }, { status: 500 });
  }
}
