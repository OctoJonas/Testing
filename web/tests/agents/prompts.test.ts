import { describe, expect, it } from "vitest";
import {
  EvaluationPromptConfig,
  getEvaluationPrompt,
  getSystemPrompt,
} from "@/lib/agents/prompts";

const CORE = ["relevance", "accuracy", "completeness", "helpfulness", "coherence"];

describe("EvaluationPromptConfig", () => {
  it("defaults to German", () => {
    expect(new EvaluationPromptConfig().language).toBe("de");
  });
});

describe("getSystemPrompt", () => {
  it("uses override when set", () => {
    expect(getSystemPrompt(new EvaluationPromptConfig({ systemPrompt: "Custom" }))).toBe("Custom");
  });

  it("returns language-matched defaults", () => {
    expect(getSystemPrompt(new EvaluationPromptConfig({ language: "de" }))).toContain("Du bist");
    expect(getSystemPrompt(new EvaluationPromptConfig({ language: "en" }))).toContain("You are");
  });
});

describe("getEvaluationPrompt (metric-driven)", () => {
  it("substitutes Q/E/A and injects exactly the selected metrics", () => {
    const out = getEvaluationPrompt({
      config: new EvaluationPromptConfig({ language: "en" }),
      question: "Q",
      expected: "E",
      actual: "A",
      metrics: ["relevance", "faithfulness"],
    });
    expect(out).toContain("Question: Q");
    expect(out).toContain("Expected Answer (reference): E");
    expect(out).toContain("Actual Response: A");
    expect(out).toContain("1. RELEVANCE:");
    expect(out).toContain("2. FAITHFULNESS:");
    expect(out).toContain('"faithfulness": 0.0-1.0');
    // Unselected metrics must not appear.
    expect(out).not.toContain("COMPLETENESS:");
    expect(out).not.toContain('"helpfulness"');
  });

  it("renders German instructions for de", () => {
    const out = getEvaluationPrompt({
      config: new EvaluationPromptConfig({ language: "de" }),
      question: "Q",
      expected: "E",
      actual: "A",
      metrics: CORE,
    });
    expect(out).toContain("Frage: Q");
    expect(out).toContain("relevant ist die Antwort");
  });

  it("custom template wins and may inject metrics via placeholders", () => {
    const out = getEvaluationPrompt({
      config: new EvaluationPromptConfig({
        evaluationTemplate: "EVAL {question}/{actual} :: {metrics_block}",
      }),
      question: "Q",
      expected: "E",
      actual: "A",
      metrics: ["safety"],
    });
    expect(out.startsWith("EVAL Q/A :: ")).toBe(true);
    expect(out).toContain("1. SAFETY:");
  });
});
