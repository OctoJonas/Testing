"use client";

import { useEffect, useMemo, useState } from "react";
import { QARunArchive, type ArchivedRun } from "@/services/qaRunArchive";
import { diffRuns, type DiffEntry, type Verdict } from "@/lib/qa-diff";

const VERDICT_LABEL: Record<Verdict, string> = {
  still_pass: "Still pass",
  still_fail: "Still fail",
  improved: "Improved",
  regressed: "Regressed",
  added: "Added",
  removed: "Removed",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  still_pass: "bg-green-100 text-green-700",
  still_fail: "bg-gray-100 text-gray-700",
  improved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  regressed: "bg-red-100 text-red-800 border-red-300",
  added: "bg-blue-100 text-blue-700",
  removed: "bg-yellow-100 text-yellow-700",
};

export default function CompareRunsPanel() {
  const [runs, setRuns] = useState<ArchivedRun[]>(() => QARunArchive.list());
  const [baselineId, setBaselineId] = useState<string>("");
  const [candidateId, setCandidateId] = useState<string>("");

  useEffect(() => {
    return QARunArchive.subscribe(() => setRuns(QARunArchive.list()));
  }, []);

  const baseline = runs.find((r) => r.id === baselineId);
  const candidate = runs.find((r) => r.id === candidateId);

  const diff = useMemo(() => {
    if (!baseline || !candidate || baseline.id === candidate.id) return null;
    return diffRuns({
      baseline: baseline.results,
      candidate: candidate.results,
      baselineLabel: baseline.label,
      candidateLabel: candidate.label,
    });
  }, [baseline, candidate]);

  if (runs.length < 2) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6 text-sm text-gray-600">
        Run two or more Q&A tests to compare them. Each test you complete is automatically archived
        (last 10) so you can diff prompt iterations or model changes side-by-side.
      </div>
    );
  }

  const removeRun = (id: string) => {
    QARunArchive.remove(id);
    if (baselineId === id) setBaselineId("");
    if (candidateId === id) setCandidateId("");
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          Compare runs{" "}
          <span className="text-sm font-normal text-gray-500">
            ({runs.length} archived in this browser)
          </span>
        </h3>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete all ${runs.length} archived runs from this browser?`)) {
              QARunArchive.clear();
              setBaselineId("");
              setCandidateId("");
            }
          }}
          className="text-xs text-gray-500 hover:text-red-600 underline underline-offset-2"
        >
          Clear archive
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="baseline-select" className="block text-xs font-semibold text-gray-700">
              Baseline
            </label>
            {baseline && (
              <button
                type="button"
                onClick={() => removeRun(baseline.id)}
                className="text-[10px] text-gray-400 hover:text-red-600"
              >
                ✕ delete this run
              </button>
            )}
          </div>
          <select
            id="baseline-select"
            value={baselineId}
            onChange={(e) => setBaselineId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">— Select baseline —</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="candidate-select" className="block text-xs font-semibold text-gray-700">
              Candidate
            </label>
            {candidate && (
              <button
                type="button"
                onClick={() => removeRun(candidate.id)}
                className="text-[10px] text-gray-400 hover:text-red-600"
              >
                ✕ delete this run
              </button>
            )}
          </div>
          <select
            id="candidate-select"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">— Select candidate —</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {diff && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
            <Stat label="Compared" value={diff.summary.totalCommon} />
            <Stat label="Improved" value={diff.summary.improved} tone="emerald" />
            <Stat label="Regressed" value={diff.summary.regressed} tone="red" />
            <Stat label="Still pass" value={diff.summary.stillPass} />
            <Stat label="Still fail" value={diff.summary.stillFail} />
            <Stat label="Added" value={diff.summary.added} />
            <Stat label="Removed" value={diff.summary.removed} />
          </div>
          <div className="text-xs text-gray-600 mb-3">
            Average score change:{" "}
            <span
              className={`font-semibold ${
                diff.summary.averageScoreDelta > 0
                  ? "text-emerald-700"
                  : diff.summary.averageScoreDelta < 0
                    ? "text-red-700"
                    : "text-gray-700"
              }`}
            >
              {diff.summary.averageScoreDelta >= 0 ? "+" : ""}
              {(diff.summary.averageScoreDelta * 100).toFixed(1)}%
            </span>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {diff.entries.map((e) => (
              <DiffRow key={`${e.verdict}-${e.index}-${e.question.slice(0, 32)}`} entry={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "red";
}) {
  const colour =
    tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
      <div className={`text-lg font-bold ${colour}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  const baselineScore =
    entry.baseline?.overall_score !== undefined ? Math.round(entry.baseline.overall_score * 100) : null;
  const candidateScore =
    entry.candidate?.overall_score !== undefined ? Math.round(entry.candidate.overall_score * 100) : null;
  const deltaPct = Math.round(entry.scoreDelta * 100);

  return (
    <div className={`border rounded-lg p-3 text-sm ${VERDICT_STYLE[entry.verdict]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold uppercase text-[10px] tracking-wider">
          {VERDICT_LABEL[entry.verdict]}
        </span>
        <span className="text-xs">
          {baselineScore !== null ? `${baselineScore}%` : "—"} →{" "}
          {candidateScore !== null ? `${candidateScore}%` : "—"}
          {entry.baseline && entry.candidate && (
            <span className="ml-2 font-mono">
              ({deltaPct >= 0 ? "+" : ""}
              {deltaPct})
            </span>
          )}
        </span>
      </div>
      <div className="text-gray-900 font-medium break-words">{entry.question}</div>
      {entry.candidate?.actual_response && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-gray-700">Show responses</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
            <div>
              <div className="font-semibold mb-1">Baseline</div>
              <div className="bg-white/70 rounded p-2 break-words">
                {entry.baseline?.actual_response ?? "—"}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Candidate</div>
              <div className="bg-white/70 rounded p-2 break-words">
                {entry.candidate.actual_response ?? "—"}
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
