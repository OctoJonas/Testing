"use client";

import { useCallback, useEffect, useState } from "react";

import { SuitesApi, type RunSummary } from "@/services/suitesApi";
import { useToast } from "@/contexts/useToast";
import type { QATestResults } from "@/lib/types";

interface RunHistoryProps {
  suiteId: string;
  /** Bumped by the parent after a new run is persisted → refetch. */
  refreshKey: number;
  /** Load a stored run's full results into the results view. */
  onViewRun: (results: QATestResults) => void;
}

/** Dependency-free pass-rate sparkline (oldest → newest, left → right). */
function TrendLine({ runs }: { runs: RunSummary[] }) {
  const chrono = [...runs].reverse();
  if (chrono.length < 2) return null;
  const w = 280;
  const h = 48;
  const pad = 4;
  const xs = chrono.map((_, i) => pad + (i * (w - 2 * pad)) / (chrono.length - 1));
  const rate = (r: RunSummary) => (r.total > 0 ? r.passed / r.total : 0);
  const ys = chrono.map((r) => h - pad - rate(r) * (h - 2 * pad));
  const points = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const last = chrono[chrono.length - 1];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Pass rate trend across ${chrono.length} runs, latest ${Math.round(rate(last) * 100)}%`}
      className="shrink-0"
    >
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" strokeWidth="1" />
      <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2" />
      {xs.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={ys[i]}
          r="2.5"
          fill={chrono[i].infraErrors > 0 ? "#f59e0b" : "#4f46e5"}
        >
          <title>
            {new Date(chrono[i].startedAt).toLocaleString()}: {Math.round(rate(chrono[i]) * 100)}%
            {chrono[i].infraErrors > 0 ? ` (${chrono[i].infraErrors} widget errors)` : ""}
          </title>
        </circle>
      ))}
    </svg>
  );
}

export default function RunHistory({ suiteId, refreshKey, onViewRun }: RunHistoryProps) {
  const { showToast } = useToast();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loadingRun, setLoadingRun] = useState<string | null>(null);

  const refresh = useCallback(() => {
    SuitesApi.runs(suiteId)
      .then(setRuns)
      .catch((err) => console.warn("[RunHistory] fetch failed:", err));
  }, [suiteId]);
  useEffect(refresh, [refresh, refreshKey]);

  if (runs.length === 0) return null;

  const handleView = async (id: string) => {
    setLoadingRun(id);
    try {
      onViewRun(await SuitesApi.runResults(id));
    } catch (err) {
      showToast(`Failed to load run: ${(err as Error).message}`, "error");
    } finally {
      setLoadingRun(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await SuitesApi.deleteRun(id);
      refresh();
    } catch (err) {
      showToast(`Failed to delete run: ${(err as Error).message}`, "error");
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          Run History <span className="text-sm font-normal text-gray-500">({runs.length})</span>
        </h3>
        <TrendLine runs={runs} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-3">When</th>
              <th className="py-1 pr-3">Config</th>
              <th className="py-1 pr-3">Pass rate</th>
              <th className="py-1 pr-3">Errors</th>
              <th className="py-1 pr-3">Median resp.</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const rate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
              return (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {new Date(r.startedAt).toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3">{r.configName ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`font-medium ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}
                    >
                      {rate}%
                    </span>{" "}
                    <span className="text-gray-500">
                      ({r.passed}/{r.total})
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.infraErrors > 0 ? (
                      <span className="text-amber-600">{r.infraErrors}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.latencyMedianMs !== null ? `${(r.latencyMedianMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => void handleView(r.id)}
                      disabled={loadingRun === r.id}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3 disabled:opacity-50"
                    >
                      {loadingRun === r.id ? "Loading…" : "View"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r.id)}
                      aria-label="Delete run"
                      className="text-gray-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
