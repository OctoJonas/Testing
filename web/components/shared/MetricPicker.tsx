"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/services/api";

export interface MetricDef {
  key: string;
  label: string;
  group: string;
  de: string;
  en: string;
}

export interface MetricProfile {
  key: string;
  name: string;
  description: string;
  context: "qa" | "autonomous" | "both";
  metrics: string[];
}

const GROUP_LABELS: Record<string, string> = {
  core: "Core quality",
  rag: "RAG (reference-based)",
  conversational: "Conversational",
  style: "Style & safety",
};

interface MetricPickerProps {
  selected: string[];
  onChange: (metrics: string[]) => void;
  /** Show only profiles for this testing mode. */
  context: "qa" | "autonomous";
  /** Tooltip language for metric definitions. */
  language?: "de" | "en";
}

/**
 * Shared profile + metric-chip picker, driven by /api/evaluation/config so
 * TestPilot and Autonomous always present the same registry.
 */
export default function MetricPicker({
  selected,
  onChange,
  context,
  language = "de",
}: MetricPickerProps) {
  const [registry, setRegistry] = useState<MetricDef[]>([]);
  const [profiles, setProfiles] = useState<MetricProfile[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/evaluation/config`)
      .then((res) => res.json())
      .then((data: { metric_registry?: MetricDef[]; profiles?: MetricProfile[] }) => {
        setRegistry(data.metric_registry ?? []);
        setProfiles(
          (data.profiles ?? []).filter((p) => p.context === context || p.context === "both"),
        );
      })
      .catch((err) => console.error("Failed to fetch evaluation config:", err));
  }, [context]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const activeProfile = useMemo(() => {
    for (const p of profiles) {
      if (p.metrics.length === selectedSet.size && p.metrics.every((m) => selectedSet.has(m))) {
        return p.key;
      }
    }
    return "custom";
  }, [profiles, selectedSet]);

  const toggleMetric = (key: string) => {
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(registry.filter((m) => next.has(m.key)).map((m) => m.key));
  };

  const groups = useMemo(() => {
    const byGroup = new Map<string, MetricDef[]>();
    for (const m of registry) {
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return [...byGroup.entries()];
  }, [registry]);

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`metric-profile-${context}`}
          className="block text-sm font-semibold text-gray-700 mb-1"
        >
          Metric Profile
        </label>
        <select
          id={`metric-profile-${context}`}
          value={activeProfile}
          onChange={(e) => {
            const p = profiles.find((x) => x.key === e.target.value);
            if (p) onChange(p.metrics);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
        >
          {profiles.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
          {activeProfile === "custom" && <option value="custom">Custom selection</option>}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {activeProfile === "custom"
            ? "Custom metric selection — adjust below."
            : profiles.find((p) => p.key === activeProfile)?.description}
        </p>
      </div>

      <div>
        <span className="block text-sm font-semibold text-gray-700 mb-2">
          Metrics ({selectedSet.size} selected)
        </span>
        <div className="space-y-3">
          {groups.map(([group, defs]) => (
            <div key={group}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                {GROUP_LABELS[group] ?? group}
              </div>
              <div className="flex flex-wrap gap-2">
                {defs.map((m) => {
                  const on = selectedSet.has(m.key);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMetric(m.key)}
                      title={language === "de" ? m.de : m.en}
                      aria-pressed={on}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        on
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
