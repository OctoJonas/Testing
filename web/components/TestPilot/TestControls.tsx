"use client";

import { useState } from "react";
import { API_URL } from "@/services/api";
import type { QATestResults } from "@/lib/types";

interface TestControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  hasResults: boolean;
  qaPairsCount: number;
  selectedConfig: string;
  isConfigured: boolean;
  results: QATestResults | null;
  /** Rows that hit widget/backend errors in the last run — retryable. */
  retryableCount?: number;
  onStartTest: () => void;
  onStopTest: () => void;
  onPauseTest: () => void;
  onResumeTest: () => void;
  onSaveResults: () => void;
  onRetryErrors?: () => void;
}

export default function TestControls({
  isRunning,
  isPaused,
  hasResults,
  qaPairsCount,
  selectedConfig,
  isConfigured,
  results,
  retryableCount = 0,
  onStartTest,
  onStopTest,
  onPauseTest,
  onResumeTest,
  onSaveResults,
  onRetryErrors,
}: TestControlsProps) {
  const [isExporting, setIsExporting] = useState(false);

  const tooltip = !selectedConfig
    ? "Please select a configuration"
    : !isConfigured
      ? "Waiting for authentication..."
      : qaPairsCount === 0
        ? "Please upload an Excel file"
        : "";

  const isDisabled = isRunning || qaPairsCount === 0 || !selectedConfig || !isConfigured;

  const handleExport = async (format: "pdf" | "excel") => {
    if (!results) return;
    setIsExporting(true);
    try {
      const endpoint = format === "pdf" ? "/api/export/pdf" : "/api/export/excel";
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results),
      });
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);

      const cd = response.headers.get("Content-Disposition");
      let filename = format === "pdf" ? "qa_results.pdf" : "qa_results.xlsx";
      if (cd) {
        const match = cd.match(/filename="?([^";]+)/);
        if (match) filename = match[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error:", error);
      alert(`Failed to export: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-2 mb-6">
      {isDisabled && !isRunning && tooltip && (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{tooltip}</div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStartTest}
          disabled={isDisabled}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (isPaused ? "Paused" : "Running...") : "Start Test"}
        </button>
        {isRunning && (
          isPaused ? (
            <button
              type="button"
              onClick={onResumeTest}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={onPauseTest}
              className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              ⏸ Pause
            </button>
          )
        )}
        <button
          type="button"
          onClick={onStopTest}
          disabled={!isRunning}
          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Stop Test
        </button>
        {hasResults && !isRunning && retryableCount > 0 && onRetryErrors && (
          <button
            type="button"
            onClick={onRetryErrors}
            title="Re-run only the questions that hit widget/backend errors and merge the answers into this report"
            className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
          >
            ↻ Retry {retryableCount} errored
          </button>
        )}
        {hasResults && (
          <>
            <button
              type="button"
              onClick={onSaveResults}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Save Results
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={isExporting}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("excel")}
              disabled={isExporting}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export Excel"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
