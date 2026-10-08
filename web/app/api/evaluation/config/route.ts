/**
 * Evaluation configuration for the settings UI: the metric registry and
 * profiles (single source of truth in lib/agents/metrics.ts) plus the legacy
 * template fields older clients still read.
 */
import { AVAILABLE_METRICS, METRIC_DESCRIPTIONS } from "@/lib/agents/evaluation";
import { METRIC_PROFILES, METRIC_REGISTRY } from "@/lib/agents/metrics";
import { defaultPromptConfigPayload } from "@/lib/agents/prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = defaultPromptConfigPayload();
  // Modern fields — drive the profile/metric-chip UI.
  config.metric_registry = METRIC_REGISTRY;
  config.profiles = METRIC_PROFILES;
  // Legacy fields kept for older clients.
  config.available_metrics = AVAILABLE_METRICS;
  config.metric_descriptions = METRIC_DESCRIPTIONS;
  return Response.json(config);
}
