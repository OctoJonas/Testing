import { describe, expect, it } from "vitest";
import {
  activeMetrics,
  buildEvaluationResultDict,
  computeOverallScore,
  errorEvaluationDict,
  isSatisfactory,
  metricsTo100,
} from "@/lib/agents/evaluation";

const baseMetrics = {
  relevance: 0.8,
  accuracy: 0.7,
  completeness: 0.9,
  helpfulness: 0.8,
  coherence: 0.7,
};

describe("activeMetrics", () => {
  it("includes only number values", () => {
    const m = { ...baseMetrics, faithfulness: 0.95 };
    const active = activeMetrics(m);
    expect(active.faithfulness).toBe(0.95);
    expect(Object.keys(active)).toHaveLength(6);
  });
});

describe("metricsTo100", () => {
  it("rounds to 0-100", () => {
    const out = metricsTo100(baseMetrics);
    expect(out.relevance).toBe(80);
    expect(out.coherence).toBe(70);
  });
});

describe("computeOverallScore", () => {
  it("returns the equal-weight mean by default", () => {
    expect(computeOverallScore(baseMetrics)).toBeCloseTo(0.78, 1);
  });

  it("respects weights", () => {
    const s = computeOverallScore(baseMetrics, { relevance: 4, coherence: 0 });
    // relevance dominates, coherence ignored. Other metrics default to 1.
    // (0.8*4 + 0.7*1 + 0.9*1 + 0.8*1 + 0.7*0) / (4+1+1+1+0) = 5.6 / 7 = 0.8
    expect(s).toBeCloseTo(0.8, 2);
  });

  it("returns 0 when no active metrics", () => {
    expect(computeOverallScore({ relevance: 0, accuracy: 0, completeness: 0, helpfulness: 0, coherence: 0 })).toBe(0);
  });
});

describe("isSatisfactory", () => {
  it("uses the threshold", () => {
    expect(isSatisfactory(0.7)).toBe(true);
    expect(isSatisfactory(0.69)).toBe(false);
    expect(isSatisfactory(0.5, 0.4)).toBe(true);
  });
});

describe("buildEvaluationResultDict", () => {
  it("produces the v2.0 result shape the frontend expects", () => {
    const out = buildEvaluationResultDict({
      metrics: baseMetrics,
      evaluation: "Solid",
      reasoning: "Hits all asks",
      evaluatorModel: "claude-sonnet-4-5",
    });
    expect(out.is_satisfactory).toBe(true);
    expect(out.overall_score_100).toBe(78);
    expect(out.metrics).toBeDefined();
    expect(out.scores).toBeDefined();
    expect((out.metadata as { evaluator: string }).evaluator).toBe("claude-sonnet-4-5");
    expect(out.evaluation).toBe("Solid");
    expect(out.reasoning).toBe("Hits all asks");
  });
});

describe("errorEvaluationDict", () => {
  it("returns is_satisfactory=false with zeroed metrics", () => {
    const out = errorEvaluationDict("err", "reason", "claude-sonnet-4-5");
    expect(out.is_satisfactory).toBe(false);
    expect(out.overall_score).toBe(0);
    expect(out.evaluation).toBe("err");
  });
});
