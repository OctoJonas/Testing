"use client";

import { memo, useMemo, useState } from "react";
import type { QATestResult, QATestResults } from "@/lib/types";
import { annotateExpected } from "@/lib/text-compare";
import MetricsDisplay from "../shared/MetricsDisplay";
import Markdown from "../shared/Markdown";

type ResultFilter = "all" | "passed" | "failed" | "errors";
type ResultSort = "index" | "score_asc" | "score_desc" | "slowest";

function isInfra(r: QATestResult): boolean {
  return r.status === "widget_error" || r.status === "no_response";
}

function formatMs(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * Expected answer with tokens missing from the actual response highlighted.
 * Lexical heuristic (see lib/text-compare) — flagged as such in the legend.
 */
function ExpectedWithDiff({ expected, actual }: { expected: string; actual: string }) {
  const segments = annotateExpected(expected, actual);
  const anyMissing = segments.some((s) => s.missing);
  return (
    <div>
      <p className="text-gray-600 mt-1">
        {segments.map((s, i) =>
          s.missing ? (
            <mark key={i} className="bg-amber-200 text-gray-900 rounded px-0.5">
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      {anyMissing && (
        <p className="text-xs text-amber-700 mt-1">
          <mark className="bg-amber-200 rounded px-0.5">Highlighted</mark> terms from the
          expected answer were not found in the actual response (lexical match — the score
          above remains authoritative).
        </p>
      )}
    </div>
  );
}

interface TestResultsProps {
  results: QATestResults;
}

interface ResultRowProps {
  result: QATestResult;
  isExpanded: boolean;
  onToggle: () => void;
}

const ResultRow = memo(function ResultRow({ result, isExpanded, onToggle }: ResultRowProps) {
  const hasMetrics = result.metrics && Object.keys(result.metrics).length > 0;
  // Widget/backend failures aren't bot answers — show them as ERROR (amber),
  // not FAIL (red), so bad answers and broken infrastructure read differently.
  const isInfraError = result.status === "widget_error" || result.status === "no_response";

  return (
    <div
      id={`qa-result-${result.index}`}
      className={`p-4 rounded-lg border scroll-mt-4 ${
        result.is_satisfactory
          ? "bg-green-50 border-green-200"
          : isInfraError
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          Q{result.index + 1}
          {result.conversation_id && (
            <span className="text-xs text-gray-500 font-normal">
              ID: {result.conversation_id.substring(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {typeof result.response_time_ms === "number" && (
            <span
              className="text-xs text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5"
              title="Widget response time"
            >
              {formatMs(result.response_time_ms)}
            </span>
          )}
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              result.is_satisfactory
                ? "bg-green-600 text-white"
                : isInfraError
                  ? "bg-amber-500 text-white"
                  : "bg-red-600 text-white"
            }`}
          >
            {result.is_satisfactory ? "PASS" : isInfraError ? "ERROR" : "FAIL"}
          </div>
        </div>
      </div>

      {hasMetrics && result.metrics && (
        <div className="mb-3">
          <MetricsDisplay metrics={result.metrics} overallScore={result.overall_score} compact={!isExpanded} />
        </div>
      )}

      {!hasMetrics && result.score !== undefined && (
        <div className="mb-3 text-sm text-gray-600">Score: {result.score}/100</div>
      )}

      <div className="text-sm space-y-2">
        <div>
          <span className="font-medium text-gray-700">Frage:</span>
          <p className="text-gray-900 mt-1">{result.question}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
          className="text-blue-600 hover:text-blue-700 text-xs font-medium"
        >
          {isExpanded ? "▼ Show less" : "▶ Show more"}
        </button>
        {isExpanded && (
          <>
            <div>
              <span className="font-medium text-gray-700">Erwartete Antwort:</span>
              {result.status === "answered" || result.status === undefined ? (
                <ExpectedWithDiff expected={result.expected_answer} actual={result.actual_response} />
              ) : (
                <p className="text-gray-600 mt-1">{result.expected_answer}</p>
              )}
            </div>
            <div>
              <span className="font-medium text-gray-700">Tatsächliche Antwort:</span>
              <div className="text-gray-900 mt-1">
                <Markdown content={result.actual_response} />
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-700">Bewertung:</span>
              <p className="text-gray-600 mt-1">{result.evaluation}</p>
            </div>
            {result.reasoning && (
              <div>
                <span className="font-medium text-gray-700">Begründung:</span>
                <p className="text-gray-600 mt-1 whitespace-pre-wrap">{result.reasoning}</p>
              </div>
            )}
            {result.metadata && (
              <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
                Model: {result.metadata.evaluator} | Version: {result.metadata.evaluation_version}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default function TestResults({ results }: TestResultsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ResultSort>("index");

  const infraErrors = results.infrastructure_errors ?? 0;
  const failedAnswers = Math.max(0, results.failed - infraErrors);

  const visible = useMemo(() => {
    let rows = results.results ?? [];
    if (filter === "passed") rows = rows.filter((r) => r.is_satisfactory);
    else if (filter === "failed") rows = rows.filter((r) => !r.is_satisfactory && !isInfra(r));
    else if (filter === "errors") rows = rows.filter(isInfra);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.question.toLowerCase().includes(q) ||
          r.expected_answer.toLowerCase().includes(q) ||
          r.actual_response.toLowerCase().includes(q),
      );
    }
    if (sort !== "index") {
      rows = [...rows].sort((a, b) => {
        if (sort === "slowest") return (b.response_time_ms ?? 0) - (a.response_time_ms ?? 0);
        const sa = a.overall_score ?? 0;
        const sb = b.overall_score ?? 0;
        return sort === "score_asc" ? sa - sb : sb - sa;
      });
    }
    return rows;
  }, [results.results, filter, search, sort]);

  // Toggling card: clicking the active filter goes back to "all".
  const setCardFilter = (f: ResultFilter) => setFilter((prev) => (prev === f ? "all" : f));
  const cardClass = (f: ResultFilter, border: string) =>
    `bg-white p-4 rounded-lg border ${border} text-left w-full transition-shadow hover:shadow ${
      filter === f ? "ring-2 ring-blue-500" : ""
    }`;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Test Results</h3>
        {/* Self-describing report: which evaluator, what bar, when, how fast. */}
        <p className="text-xs text-gray-500 mt-1">
          Evaluator: <span className="font-mono">{results.model}</span>
          {results.threshold !== undefined && (
            <> · Pass threshold: ≥{Math.round(results.threshold * 100)}%</>
          )}
          {results.latency && (
            <>
              {" "}
              · Widget response: median {formatMs(results.latency.median_ms)} · p95{" "}
              {formatMs(results.latency.p95_ms)}
            </>
          )}
          {results.timestamp && <> · {new Date(results.timestamp).toLocaleString()}</>}
        </p>
      </div>

      <div className={`grid ${infraErrors > 0 ? "grid-cols-4" : "grid-cols-3"} gap-4 mb-4`}>
        <button type="button" onClick={() => setCardFilter("all")} className={cardClass("all", "border-gray-200")}>
          <div className="text-2xl font-bold text-gray-900">{results.total}</div>
          <div className="text-sm text-gray-600">Total Tests</div>
        </button>
        <button
          type="button"
          onClick={() => setCardFilter("passed")}
          className={cardClass("passed", "border-green-200")}
        >
          <div className="text-2xl font-bold text-green-600">{results.satisfactory}</div>
          <div className="text-sm text-gray-600">Passed</div>
        </button>
        <button
          type="button"
          onClick={() => setCardFilter("failed")}
          className={cardClass("failed", "border-red-200")}
        >
          <div className="text-2xl font-bold text-red-600">{failedAnswers}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </button>
        {infraErrors > 0 && (
          <button
            type="button"
            onClick={() => setCardFilter("errors")}
            className={cardClass("errors", "border-amber-200")}
          >
            <div className="text-2xl font-bold text-amber-600">{infraErrors}</div>
            <div className="text-sm text-gray-600">Widget Errors</div>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions and answers…"
          aria-label="Search results"
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ResultSort)}
          aria-label="Sort results"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="index">Order: as uploaded</option>
          <option value="score_asc">Score: worst first</option>
          <option value="score_desc">Score: best first</option>
          <option value="slowest">Response: slowest first</option>
        </select>
        {(filter !== "all" || search) && (
          <span className="text-xs text-gray-500">
            {visible.length} of {results.results?.length ?? 0} shown
          </span>
        )}
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">No results match this view.</div>
        ) : (
          visible.map((result) => (
            <ResultRow
              key={result.index}
              result={result}
              isExpanded={expandedIndex === result.index}
              onToggle={() =>
                setExpandedIndex((prev) => (prev === result.index ? null : result.index))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
