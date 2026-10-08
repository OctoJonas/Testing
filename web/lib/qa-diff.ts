/**
 * Diff helpers for comparing two Q&A test runs. Used by the Compare panel
 * in TestpilotTab.
 */
import type { QATestResult, QATestResults } from "./types";

export type Verdict = "still_pass" | "still_fail" | "improved" | "regressed" | "added" | "removed";

export interface DiffEntry {
  question: string;
  expected_answer: string;
  index: number;
  baseline: QATestResult | null;
  candidate: QATestResult | null;
  verdict: Verdict;
  scoreDelta: number; // candidate.overall_score - baseline.overall_score (0-1 scale)
}

export interface DiffSummary {
  totalCommon: number;
  improved: number;
  regressed: number;
  stillPass: number;
  stillFail: number;
  added: number;
  removed: number;
  averageScoreDelta: number;
  baselineLabel: string;
  candidateLabel: string;
}

function keyFor(r: QATestResult): string {
  // Pair on question text — index can drift if rows are reordered.
  return r.question.trim().toLowerCase();
}

export function diffRuns(args: {
  baseline: QATestResults;
  candidate: QATestResults;
  baselineLabel?: string;
  candidateLabel?: string;
}): { entries: DiffEntry[]; summary: DiffSummary } {
  const baseByKey = new Map<string, QATestResult>();
  for (const r of args.baseline.results) baseByKey.set(keyFor(r), r);
  const candByKey = new Map<string, QATestResult>();
  for (const r of args.candidate.results) candByKey.set(keyFor(r), r);

  const entries: DiffEntry[] = [];

  // Common + removed baseline keys.
  for (const [k, base] of baseByKey) {
    const cand = candByKey.get(k);
    if (cand) {
      const verdict: Verdict =
        base.is_satisfactory && cand.is_satisfactory
          ? "still_pass"
          : !base.is_satisfactory && !cand.is_satisfactory
            ? "still_fail"
            : !base.is_satisfactory && cand.is_satisfactory
              ? "improved"
              : "regressed";
      entries.push({
        question: base.question,
        expected_answer: base.expected_answer,
        index: cand.index,
        baseline: base,
        candidate: cand,
        verdict,
        scoreDelta: (cand.overall_score ?? 0) - (base.overall_score ?? 0),
      });
    } else {
      entries.push({
        question: base.question,
        expected_answer: base.expected_answer,
        index: base.index,
        baseline: base,
        candidate: null,
        verdict: "removed",
        scoreDelta: 0,
      });
    }
  }
  // Added candidate-only.
  for (const [k, cand] of candByKey) {
    if (baseByKey.has(k)) continue;
    entries.push({
      question: cand.question,
      expected_answer: cand.expected_answer,
      index: cand.index,
      baseline: null,
      candidate: cand,
      verdict: "added",
      scoreDelta: 0,
    });
  }

  // Sort: regressed first (highest pain), improved next, then unchanged.
  const order: Record<Verdict, number> = {
    regressed: 0,
    improved: 1,
    still_fail: 2,
    still_pass: 3,
    added: 4,
    removed: 5,
  };
  entries.sort((a, b) => order[a.verdict] - order[b.verdict] || a.index - b.index);

  const common = entries.filter((e) => e.baseline && e.candidate);
  const summary: DiffSummary = {
    totalCommon: common.length,
    improved: entries.filter((e) => e.verdict === "improved").length,
    regressed: entries.filter((e) => e.verdict === "regressed").length,
    stillPass: entries.filter((e) => e.verdict === "still_pass").length,
    stillFail: entries.filter((e) => e.verdict === "still_fail").length,
    added: entries.filter((e) => e.verdict === "added").length,
    removed: entries.filter((e) => e.verdict === "removed").length,
    averageScoreDelta:
      common.length > 0
        ? common.reduce((s, e) => s + e.scoreDelta, 0) / common.length
        : 0,
    baselineLabel: args.baselineLabel ?? "Baseline",
    candidateLabel: args.candidateLabel ?? "Candidate",
  };
  return { entries, summary };
}
