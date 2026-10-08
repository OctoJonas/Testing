import { describe, expect, it } from "vitest";

import {
  METRIC_PROFILES,
  METRIC_REGISTRY,
  buildEvaluationToolSchema,
  buildMetricInstructions,
  getProfile,
  resolveMetrics,
  sanitizeMetricKeys,
} from "@/lib/agents/metrics";

describe("metric registry", () => {
  it("profiles reference only registered metrics", () => {
    const keys = new Set(METRIC_REGISTRY.map((m) => m.key));
    for (const p of METRIC_PROFILES) {
      for (const m of p.metrics) expect(keys.has(m), `${p.key} → ${m}`).toBe(true);
    }
  });

  it("does not offer unmeasurable RAGAS context metrics", () => {
    // No retrieved contexts are available from the widget protocol, so these
    // must not be selectable (legacy runs may still display them).
    const keys = new Set(METRIC_REGISTRY.map((m) => m.key));
    expect(keys.has("context_precision")).toBe(false);
    expect(keys.has("context_recall")).toBe(false);
  });
});

describe("resolveMetrics", () => {
  it("explicit metrics win and are sanitized to registry order", () => {
    expect(resolveMetrics({ metrics: ["faithfulness", "relevance", "bogus"] })).toEqual([
      "relevance",
      "faithfulness",
    ]);
  });

  it("legacy use_ragas maps to the rag profile", () => {
    expect(resolveMetrics({ use_ragas: true })).toEqual(getProfile("rag")!.metrics);
  });

  it("defaults to core", () => {
    expect(resolveMetrics({})).toEqual(getProfile("core")!.metrics);
  });

  it("all-invalid metric lists fall back to core", () => {
    expect(sanitizeMetricKeys(["nope", "nada"])).toEqual(getProfile("core")!.metrics);
  });
});

describe("buildEvaluationToolSchema", () => {
  it("requires exactly the selected metrics and forbids others", () => {
    const schema = buildEvaluationToolSchema(["relevance", "safety"]);
    const metrics = schema.properties.metrics as {
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    expect(metrics.required).toEqual(["relevance", "safety"]);
    expect(Object.keys(metrics.properties)).toEqual(["relevance", "safety"]);
    expect(metrics.additionalProperties).toBe(false);
  });
});

describe("buildMetricInstructions", () => {
  it("numbers metrics and uses the requested language", () => {
    const de = buildMetricInstructions(["relevance", "faithfulness"], "de");
    expect(de).toContain("1. RELEVANCE:");
    expect(de).toContain("2. FAITHFULNESS:");
    expect(de).toContain("erfundenen Fakten");
    const en = buildMetricInstructions(["faithfulness"], "en");
    expect(en).toContain("invented facts");
  });
});
