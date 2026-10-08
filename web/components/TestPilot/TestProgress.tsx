"use client";

import { useEffect, useState } from "react";

interface TestProgressProps {
  /** Questions with a final result (drives the bar and the ETA). */
  completed: number;
  totalTests: number;
  /** Epoch ms when the run started; null disables the ETA. */
  startedAt: number | null;
}

/** "~40s remaining" under a minute, "~3 min remaining" above. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "almost done";
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s remaining`;
  return `~${Math.round(seconds / 60)} min remaining`;
}

export default function TestProgress({ completed, totalTests, startedAt }: TestProgressProps) {
  // Re-render every second so elapsed/ETA tick between result events.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const done = Math.min(completed, totalTests);
  const ratio = totalTests > 0 ? Math.max(0, Math.min(1, done / totalTests)) : 0;
  const percent = Math.round(ratio * 100);

  // ETA from average completion time so far. The worker pool finishes
  // questions in parallel, so per-question average already reflects the
  // effective concurrency. Needs at least one completion to estimate.
  let eta: string | null = null;
  if (startedAt && done > 0 && done < totalTests) {
    const elapsedMs = Math.max(0, now - startedAt);
    const remainingMs = (elapsedMs / done) * (totalTests - done);
    eta = formatEta(remainingMs / 1_000);
  } else if (startedAt && done === 0) {
    eta = "estimating…";
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">Testing in progress...</span>
        <span className="text-sm text-gray-600">
          {done} / {totalTests}
          {eta && <span className="text-gray-500"> · {eta}</span>}
        </span>
      </div>
      <div
        className="w-full bg-gray-200 rounded-full h-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalTests}
        aria-valuenow={done}
        aria-label="Q&A test progress"
      >
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
