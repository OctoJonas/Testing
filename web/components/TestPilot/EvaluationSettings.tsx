"use client";

import { useState } from "react";
import MetricPicker from "../shared/MetricPicker";

export interface PromptConfig {
  language: "de" | "en";
  system_prompt?: string;
  evaluation_template?: string;
  satisfactory_threshold: number;
  /** Selected metric keys (drives prompt + tool schema server-side). */
  metrics?: string[];
  /** Legacy flag, still sent for wire compatibility. */
  use_ragas: boolean;
}

interface EvaluationSettingsProps {
  promptConfig: PromptConfig;
  onConfigChange: (config: PromptConfig) => void;
}

export default function EvaluationSettings({ promptConfig, onConfigChange }: EvaluationSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const summary = `${(promptConfig.metrics ?? []).length || 5} metrics · Pass ≥${Math.round(
    promptConfig.satisfactory_threshold * 100,
  )}% · ${promptConfig.language.toUpperCase()}`;

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="text-lg font-semibold text-gray-800">Evaluation Settings</h3>
        <span className="text-sm text-gray-500">
          {!isExpanded && <span className="mr-3 text-gray-600">{summary}</span>}
          {isExpanded ? "Hide" : "Show"}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-5">
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <MetricPicker
              selected={promptConfig.metrics ?? []}
              onChange={(metrics) => onConfigChange({ ...promptConfig, metrics, use_ragas: false })}
              context="qa"
              language={promptConfig.language}
            />
            <div className="space-y-4">
              <div>
                <label htmlFor="eval-language" className="block text-sm font-semibold text-gray-700 mb-1">
                  Evaluator Language
                </label>
                <select
                  id="eval-language"
                  value={promptConfig.language}
                  onChange={(e) =>
                    onConfigChange({ ...promptConfig, language: e.target.value as "de" | "en" })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Language of the evaluation instructions and reasoning.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Pass Threshold: {Math.round(promptConfig.satisfactory_threshold * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={promptConfig.satisfactory_threshold * 100}
                  onChange={(e) =>
                    onConfigChange({
                      ...promptConfig,
                      satisfactory_threshold: parseInt(e.target.value, 10) / 100,
                    })
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                The evaluator scores exactly the selected metrics — nothing else. True RAGAS
                context metrics need the widget&apos;s retrieved sources, which the protocol
                doesn&apos;t expose; the RAG profile judges against the expected answer instead.
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              {showAdvanced ? "▾" : "▸"} Advanced: custom prompts
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">System Prompt</label>
                  <textarea
                    value={promptConfig.system_prompt ?? ""}
                    onChange={(e) => onConfigChange({ ...promptConfig, system_prompt: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty for the built-in evaluator system prompt"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Evaluation Prompt Template
                  </label>
                  <textarea
                    value={promptConfig.evaluation_template ?? ""}
                    onChange={(e) =>
                      onConfigChange({ ...promptConfig, evaluation_template: e.target.value })
                    }
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty to generate the prompt from the selected metrics"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    A custom template overrides the generated prompt. Placeholders:{" "}
                    {"{question}"}, {"{expected}"}, {"{actual}"}, {"{metrics_block}"},{" "}
                    {"{metrics_json}"} (the last two inject your selected metrics).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onConfigChange({
                      ...promptConfig,
                      system_prompt: undefined,
                      evaluation_template: undefined,
                    })
                  }
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Reset prompts to generated defaults
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
