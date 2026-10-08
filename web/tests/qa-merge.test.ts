import { describe, expect, it } from "vitest";

import { mergeRetryResults } from "@/lib/qa-merge";
import type { QATestResult, QATestResults } from "@/lib/types";

const row = (index: number, over: Partial<QATestResult> = {}): QATestResult =>
  ({
    index,
    question: `Q${index}`,
    expected_answer: `A${index}`,
    actual_response: "answer",
    is_satisfactory: true,
    status: "answered",
    overall_score: 0.9,
    evaluation: "",
    reasoning: "",
    ...over,
  }) as QATestResult;

const run = (rows: QATestResult[], over: Partial<QATestResults> = {}): QATestResults => ({
  total: rows.length,
  satisfactory: rows.filter((r) => r.is_satisfactory).length,
  failed: rows.filter((r) => !r.is_satisfactory).length,
  infrastructure_errors: rows.filter(
    (r) => r.status === "widget_error" || r.status === "no_response",
  ).length,
  results: rows,
  model: "claude-sonnet-4-5",
  timestamp: "2026-06-10T00:00:00.000Z",
  ...over,
});

describe("mergeRetryResults", () => {
  it("replaces retried rows by original index and recomputes counters", () => {
    const base = run([
      row(0),
      row(1, { is_satisfactory: false, status: "widget_error", actual_response: "404 boom" }),
      row(2, { is_satisfactory: false, status: "no_response", actual_response: "No response" }),
    ]);
    // Retry run answered both errored questions; one passes, one fails.
    const retry = run(
      [row(1), row(2, { is_satisfactory: false, status: "answered" })],
      { total: 2, timestamp: "2026-06-10T01:00:00.000Z" },
    );

    const merged = mergeRetryResults(base, retry);
    expect(merged.total).toBe(3);
    expect(merged.satisfactory).toBe(2); // q0 + recovered q1
    expect(merged.failed).toBe(1); // q2 answered but unsatisfactory
    expect(merged.infrastructure_errors).toBe(0);
    expect(merged.results.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(merged.results[1].status).toBe("answered");
    expect(merged.timestamp).toBe("2026-06-10T01:00:00.000Z");
  });

  it("keeps base rows when the retry didn't include them", () => {
    const base = run([row(0), row(1, { is_satisfactory: false, status: "widget_error" })]);
    const retry = run([row(1, { is_satisfactory: false, status: "widget_error" })], { total: 1 });
    const merged = mergeRetryResults(base, retry);
    expect(merged.satisfactory).toBe(1);
    expect(merged.infrastructure_errors).toBe(1); // still broken after retry
    expect(merged.results[0]).toBe(base.results[0]);
  });
});
