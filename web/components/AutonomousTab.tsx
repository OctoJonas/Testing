"use client";

import { useState } from "react";
import { socketService } from "@/services/socketService";
import { useAutonomousSocket } from "@/hooks/useAutonomousSocket";
import { useConfigs } from "@/hooks/useConfigs";
import { useToast } from "@/contexts/useToast";
import Markdown from "./shared/Markdown";
import ErrorBanner from "./shared/ErrorBanner";
import MetricPicker from "./shared/MetricPicker";
import { getProfile } from "@/lib/agents/metrics";
import { deriveHint } from "@/lib/error-hints";
import { API_URL } from "@/services/api";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";
import type { AutonomousTestResult } from "@/lib/types";

interface AutonomousError {
  title: string;
  message: string;
  hint?: string;
}

export default function AutonomousTab() {
  const { showToast } = useToast();
  const configs = useConfigs();
  // Never preselect a config — connections are only established when the user
  // actively picks one.
  const [selectedConfig, setSelectedConfig] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [testingPrompt, setTestingPrompt] = useState("");
  const [maxTurns, setMaxTurns] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AutonomousTestResult | null>(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [enableEvaluation, setEnableEvaluation] = useState(false);
  const [metrics, setMetrics] = useState<string[]>(() => getProfile("conversational")!.metrics);
  const [satisfactoryThreshold, setSatisfactoryThreshold] = useState(0.7);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<AutonomousError | null>(null);

  const reportError = (title: string, message: string) => {
    setError({ title, message, hint: deriveHint(message) });
    showToast(`${title}: ${message}`, "error", 8_000);
    setIsConfigured(false);
    setIsRunning(false);
  };

  useAutonomousSocket({
    onConfigured: () => {
      setError(null);
    },
    onAuthenticated: () => {
      setIsConfigured(true);
      setError(null);
    },
    onConfigurationError: (e) => reportError("Configuration error", e),
    onAuthenticationError: (e) => reportError("Authentication error", e),
    onTestStarted: () => {
      setIsRunning(true);
      setCurrentTurn(0);
      setResult(null);
    },
    onTurnUpdate: (turn) => setCurrentTurn(turn),
    onConversationUpdate: (data) => setResult(data),
    onTestCompleted: (data) => {
      setIsRunning(false);
      setResult(data);
      showToast("Autonomous test completed", "success");
    },
    onTestStopped: () => {
      setIsRunning(false);
      showToast("Autonomous test stopped", "info");
    },
    onTestError: (e) => reportError("Autonomous Test Error", e),
  });

  const handleConfigChange = (configName: string) => {
    setSelectedConfig(configName);
    setIsConfigured(false);
    if (!configName) {
      ConnectionStatusStore.set("autonomous", "idle");
      return;
    }
    const config = configs.find((c) => c.name === configName);
    if (config) {
      if (!socketService.getSocket()) {
        showToast("Socket connection not established. Please refresh the page.", "error");
        return;
      }
      ConnectionStatusStore.set("autonomous", "configuring");
      socketService.configure(config, "autonomous");
    }
  };

  const handleStartTest = () => {
    if (!testingPrompt.trim()) {
      showToast("Please provide a testing prompt describing the test scenario.", "warning");
      return;
    }
    if (!isConfigured) {
      showToast("Please configure and authenticate first.", "warning");
      return;
    }
    socketService.startAutonomousTest(
      testingPrompt,
      maxTurns,
      enableEvaluation,
      enableEvaluation ? { metrics, satisfactoryThreshold } : undefined,
    );
  };

  const handleStopTest = () => socketService.stopAutonomousTest();

  const exportFile = async (kind: "pdf" | "excel") => {
    if (!result) return;
    setIsExporting(true);
    try {
      const endpoint = kind === "pdf" ? "/api/export/autonomous/pdf" : "/api/export/autonomous/excel";
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error((err && (err as { error?: string }).error) || "Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `autonomous_test_${new Date().toISOString().slice(0, 10)}.${kind === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(`${kind.toUpperCase()} exported successfully`, "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Export failed: ${message}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-b-lg shadow-sm p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Autonomous Testing</h2>
        <p className="text-sm text-gray-600">
          Configure an autonomous agent to conduct multi-turn conversations based on your testing goals
        </p>
      </div>

      {error && (
        <ErrorBanner
          title={error.title}
          message={error.message}
          hint={error.hint}
          onDismiss={() => setError(null)}
        />
      )}

      <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Configuration</label>
            <select
              value={selectedConfig}
              onChange={(e) => handleConfigChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Select a configuration --</option>
              {configs.map((config) => (
                <option key={config.name} value={config.name}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>
          {isConfigured && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium">✓ Configuration authenticated and ready</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Testing Instructions</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Testing Prompt</label>
            <textarea
              value={testingPrompt}
              onChange={(e) => setTestingPrompt(e.target.value)}
              placeholder="Describe what you want the autonomous agent to test."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Maximum Conversation Turns</label>
            <input
              type="number"
              value={maxTurns}
              onChange={(e) => setMaxTurns(parseInt(e.target.value, 10) || 10)}
              min={1}
              max={50}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="enable_evaluation"
              checked={enableEvaluation}
              onChange={(e) => setEnableEvaluation(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="enable_evaluation" className="text-sm text-gray-700">
              Enable per-turn evaluation (slower but provides quality metrics)
            </label>
          </div>
          {enableEvaluation && (
            <div className="mt-4 pl-4 border-l-2 border-blue-200 space-y-4">
              <MetricPicker
                selected={metrics}
                onChange={setMetrics}
                context="autonomous"
                language="de"
              />
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Pass Threshold: {Math.round(satisfactoryThreshold * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={satisfactoryThreshold * 100}
                  onChange={(e) => setSatisfactoryThreshold(parseInt(e.target.value, 10) / 100)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={handleStartTest}
          disabled={isRunning || !selectedConfig || !isConfigured}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          🚀 Start Autonomous Test
        </button>
        {isRunning && (
          <button
            type="button"
            onClick={handleStopTest}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            ⏸️ Stop Test
          </button>
        )}
      </div>

      {isRunning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Autonomous test in progress...</span>
            <span className="text-sm text-gray-600">
              Turn {currentTurn} / {maxTurns}
            </span>
          </div>
          <div
            className="w-full bg-gray-200 rounded-full h-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={maxTurns}
            aria-valuenow={Math.min(currentTurn, maxTurns)}
          >
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (currentTurn / Math.max(1, maxTurns)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Conversation History</h3>
            <div className="flex items-center gap-4">
              <div className="flex gap-2 text-sm text-gray-600">
                <span>Turns: {result.totalTurns}</span>
                <span>Duration: {Math.round(result.duration)}s</span>
                <span
                  className={`px-2 py-1 rounded font-medium ${
                    result.status === "completed"
                      ? "bg-green-100 text-green-800"
                      : result.status === "running"
                        ? "bg-blue-100 text-blue-800"
                        : result.status === "error"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {result.status.toUpperCase()}
                </span>
              </div>
              {result.status !== "running" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => exportFile("pdf")}
                    disabled={isExporting}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                  >
                    {isExporting ? "..." : "PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportFile("excel")}
                    disabled={isExporting}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                  >
                    {isExporting ? "..." : "Excel"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {result.overallEvaluation && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">Overall Evaluation</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Average Score:</span>
                  <span className="ml-2 font-medium">{Math.round(result.overallEvaluation.averageScore * 100)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Satisfactory:</span>
                  <span className="ml-2 font-medium text-green-600">
                    {result.overallEvaluation.satisfactoryTurns}/{result.overallEvaluation.totalEvaluatedTurns}
                  </span>
                </div>
                {result.overallEvaluation.metricsAverages &&
                  Object.entries(result.overallEvaluation.metricsAverages).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-gray-600 capitalize">{key.replace(/_/g, " ")}:</span>
                      <span className="ml-2 font-medium">{Math.round((value as number) * 100)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {result.conversation.map((msg, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-50 border border-blue-200"
                    : msg.role === "assistant"
                      ? "bg-white border border-gray-200"
                      : "bg-yellow-50 border border-yellow-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {msg.role === "user" ? "🤖 Agent" : msg.role === "assistant" ? "💬 Assistant" : "⚙️ System"}
                    </span>
                    <span className="text-xs text-gray-500">Turn {msg.turnNumber}</span>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                {msg.role === "assistant" ? (
                  <Markdown content={msg.content} className="text-sm" />
                ) : (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            ))}
          </div>

          {result.error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                <strong>Error:</strong> {result.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
