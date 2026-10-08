/**
 * Merge a retry run (subset of questions, original indices preserved) back
 * into the report it was retried from. Rows are replaced by index; the
 * summary counters are recomputed from the merged rows.
 */
import type { QATestResults } from "./types";

export function mergeRetryResults(base: QATestResults, retry: QATestResults): QATestResults {
  const byIndex = new Map(retry.results.map((r) => [r.index, r]));
  const mergedRows = base.results.map((r) => byIndex.get(r.index) ?? r);

  const passed = mergedRows.filter((r) => r.is_satisfactory).length;
  const infra = mergedRows.filter(
    (r) => r.status === "widget_error" || r.status === "no_response",
  ).length;

  return {
    ...base,
    // Report metadata follows the most recent evaluation.
    model: retry.model || base.model,
    timestamp: retry.timestamp || base.timestamp,
    threshold: retry.threshold ?? base.threshold,
    // Heuristic: prefer the retry's latency stats (they reflect the widget's
    // current behaviour); fall back to the base run's.
    latency: retry.latency ?? base.latency,
    satisfactory: passed,
    failed: base.total - passed,
    infrastructure_errors: infra,
    results: mergedRows,
  };
}
