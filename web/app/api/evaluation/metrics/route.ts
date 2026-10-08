import { AVAILABLE_METRICS, METRIC_DESCRIPTIONS } from "@/lib/agents/evaluation";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    metrics: AVAILABLE_METRICS,
    descriptions: METRIC_DESCRIPTIONS,
  });
}
