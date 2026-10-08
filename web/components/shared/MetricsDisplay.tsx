"use client";

import { METRIC_DESCRIPTIONS, type MetricKey } from "@/lib/agents/evaluation";
import type { EvaluationMetrics } from "@/lib/types";

interface MetricsDisplayProps {
  metrics: EvaluationMetrics;
  overallScore?: number;
  compact?: boolean;
}

const METRIC_CONFIG: Record<string, { label: string; color: string }> = {
  relevance: { label: "Relevance", color: "bg-blue-500" },
  accuracy: { label: "Accuracy", color: "bg-green-500" },
  completeness: { label: "Completeness", color: "bg-purple-500" },
  helpfulness: { label: "Helpfulness", color: "bg-orange-500" },
  coherence: { label: "Coherence", color: "bg-indigo-500" },
  faithfulness: { label: "Faithfulness", color: "bg-emerald-500" },
  answer_relevancy: { label: "Answer Relevancy", color: "bg-sky-500" },
  context_precision: { label: "Context Precision", color: "bg-lime-500" },
  context_recall: { label: "Context Recall", color: "bg-fuchsia-500" },
  clarity: { label: "Clarity", color: "bg-cyan-500" },
  specificity: { label: "Specificity", color: "bg-teal-500" },
  context_retention: { label: "Context Use", color: "bg-pink-500" },
  consistency: { label: "Consistency", color: "bg-rose-500" },
  natural_flow: { label: "Natural Flow", color: "bg-violet-500" },
  safety: { label: "Safety", color: "bg-red-500" },
  tone_appropriateness: { label: "Tone", color: "bg-amber-500" },
};

export default function MetricsDisplay({ metrics, overallScore, compact = false }: MetricsDisplayProps) {
  // Note: 0 is a legitimate (bad) score and must stay visible — only filter
  // out non-numeric values and unknown keys.
  const activeMetrics = Object.entries(metrics).filter(
    ([key, value]) =>
      typeof value === "number" && !Number.isNaN(value) && METRIC_CONFIG[key],
  ) as [string, number][];

  const scoreColor = (s: number) =>
    s >= 0.8 ? "text-green-600" : s >= 0.6 ? "text-yellow-600" : "text-red-600";
  const scoreBg = (s: number) =>
    s >= 0.8 ? "bg-green-100" : s >= 0.6 ? "bg-yellow-100" : "bg-red-100";

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {overallScore !== undefined && (
          <div className={`px-2 py-1 rounded text-sm font-medium ${scoreBg(overallScore)} ${scoreColor(overallScore)}`}>
            Overall: {(overallScore * 100).toFixed(0)}%
          </div>
        )}
        {activeMetrics.slice(0, 3).map(([key, value]) => (
          <div key={key} className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">
            {METRIC_CONFIG[key]?.label ?? key}: {(value * 100).toFixed(0)}%
          </div>
        ))}
        {activeMetrics.length > 3 && (
          <div className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-500">+{activeMetrics.length - 3} more</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {overallScore !== undefined && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-semibold text-gray-700">Overall Score</span>
          <span className={`text-2xl font-bold ${scoreColor(overallScore)}`}>{(overallScore * 100).toFixed(0)}%</span>
        </div>
      )}
      <div className="space-y-2">
        {activeMetrics.map(([key, value]) => {
          const cfg = METRIC_CONFIG[key] ?? { label: key, color: "bg-gray-500" };
          const pct = value * 100;
          return (
            <div key={key} className="space-y-1" title={METRIC_DESCRIPTIONS[key as MetricKey] ?? ""}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 cursor-help">{cfg.label}</span>
                <span className={`font-semibold ${scoreColor(value)}`}>{pct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className={`${cfg.color} h-2 rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-500 pt-2 border-t">
        <span className="font-medium">Scale:</span> 0% = Poor, 60-79% = Good, 80%+ = Excellent
      </div>
    </div>
  );
}
