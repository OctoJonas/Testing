"use client";

import { useRef, useState } from "react";
import { socketService } from "@/services/socketService";
import { mergeRetryResults } from "@/lib/qa-merge";
import { getProfile } from "@/lib/agents/metrics";
import { useTestPilotSocket } from "@/hooks/useTestPilotSocket";
import { useConfigs } from "@/hooks/useConfigs";
import { useToast } from "@/contexts/useToast";
import ConfigSection from "./TestPilot/ConfigSection";
import SuitePanel from "./TestPilot/SuitePanel";
import RunHistory from "./TestPilot/RunHistory";
import FileUploadSection from "./TestPilot/FileUploadSection";
import { SuitesApi } from "@/services/suitesApi";
import EvaluationSettings, { type PromptConfig } from "./TestPilot/EvaluationSettings";
import TestControls from "./TestPilot/TestControls";
import TestProgress from "./TestPilot/TestProgress";
import TestResults from "./TestPilot/TestResults";
import ErrorBanner from "./shared/ErrorBanner";
import CompareRunsPanel from "./TestPilot/CompareRunsPanel";
import { deriveHint } from "@/lib/error-hints";
import { API_URL } from "@/services/api";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";
import { QARunArchive } from "@/services/qaRunArchive";
import { QASuiteStore } from "@/services/qaSuiteStore";
import type { QAPair, QATestResult, QATestResults } from "@/lib/types";

interface TestpilotError {
  title: string;
  message: string;
  hint?: string;
}

// Display-only label for the in-progress results. The actual eval call uses
// the server-side FIXED_MODEL constant in lib/agents/qa-agent.ts.
const EVALUATOR_MODEL = "claude-sonnet-4-5";

export default function TestpilotTab() {
  const { showToast } = useToast();
  const configs = useConfigs();
  // Never preselect a config — connections are only established when the user
  // actively picks one. Starting empty also avoids a "Configuring…" state that
  // was never actually kicked off.
  const [selectedConfig, setSelectedConfig] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  // Restore the last uploaded suite so rerunning doesn't start from the file
  // picker. Cleared explicitly via the "Clear" control in the upload section.
  const [restoredSuite] = useState(() => QASuiteStore.load());
  const [qaPairs, setQaPairs] = useState<QAPair[]>(() => restoredSuite?.pairs ?? []);
  const [fileName, setFileName] = useState(() => restoredSuite?.fileName ?? "");
  const [suiteRestored, setSuiteRestored] = useState(() => restoredSuite !== null);
  /** Server-side suite backing the current pairs (null = ad-hoc upload). */
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(
    () => restoredSuite?.suiteId ?? null,
  );
  /** Bumped after each persisted run so RunHistory refetches. */
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [results, setResults] = useState<QATestResults | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  /** Question count of the active run (differs from qaPairs.length on retries). */
  const [runTotal, setRunTotal] = useState(0);
  /** Set while a retry-errors run is in flight; completion merges into it. */
  const retryBaseRef = useRef<QATestResults | null>(null);
  const [intermediateResults, setIntermediateResults] = useState<QATestResult[]>([]);
  const [promptConfig, setPromptConfig] = useState<PromptConfig>({
    language: "de",
    satisfactory_threshold: 0.7,
    metrics: getProfile("core")!.metrics,
    use_ragas: false,
  });
  const [error, setError] = useState<TestpilotError | null>(null);

  const reportError = (title: string, message: string) => {
    setError({ title, message, hint: deriveHint(message) });
    showToast(`${title}: ${message}`, "error", 8_000);
    setIsConfigured(false);
    setIsRunning(false);
  };

  useTestPilotSocket({
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
      setIsPaused(false);
      setRunStartedAt(Date.now());
      setResults(null);
      setIntermediateResults([]);
    },
    onTestProgress: () => {},
    onTestResult: (result) => {
      setIntermediateResults((prev) => [...prev, result as QATestResult]);
    },
    onTestCompleted: (incoming) => {
      setIsRunning(false);
      setRunStartedAt(null);
      // A retry run only re-tested the errored subset — fold its rows back
      // into the report it was started from.
      const retryBase = retryBaseRef.current;
      retryBaseRef.current = null;
      const data = retryBase ? mergeRetryResults(retryBase, incoming) : incoming;
      setResults(data);
      setIntermediateResults([]);
      if (retryBase) {
        const recovered =
          (retryBase.infrastructure_errors ?? 0) - (data.infrastructure_errors ?? 0);
        showToast(
          `Retry finished: ${recovered} of ${retryBase.infrastructure_errors ?? 0} errored questions now have answers.`,
          recovered > 0 ? "success" : "warning",
          8_000,
        );
      }
      // Auto-archive every completed run so the Compare panel always has
      // material to diff against — no manual save step required.
      try {
        const { status } = QARunArchive.archive(data);
        if (status === "failed") {
          showToast(
            "Couldn't save this run — browser storage is full. Delete old runs in Compare to free space.",
            "error",
            8_000,
          );
        } else if (status === "trimmed") {
          showToast("Storage was full — older saved runs were dropped to keep this one.", "info", 6_000);
        }
      } catch (err) {
        console.warn("[TestpilotTab] failed to archive run:", err);
      }
      // Persist to the suite's server-side history (drives the trend view).
      if (activeSuiteId) {
        SuitesApi.saveRun({
          suite_id: activeSuiteId,
          config_name: selectedConfig || null,
          results: data,
        })
          .then(() => setHistoryRefresh((n) => n + 1))
          .catch((err) =>
            showToast(`Run finished but saving to history failed: ${(err as Error).message}`, "warning"),
          );
      }
      // Completion toast names the first problem and links straight to it.
      const firstProblem = data.results.find((r) => !r.is_satisfactory);
      const infra = data.infrastructure_errors ?? 0;
      const summary = `Test complete: ${data.satisfactory} passed · ${Math.max(0, data.failed - infra)} failed · ${infra} widget errors`;
      showToast(
        summary,
        data.failed > 0 ? "warning" : "success",
        8_000,
        firstProblem
          ? {
              label: `Q${firstProblem.index + 1} ${firstProblem.status === "answered" || firstProblem.status === undefined ? "failed" : "errored"} — view`,
              onClick: () =>
                document
                  .getElementById(`qa-result-${firstProblem.index}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
            }
          : undefined,
      );
    },
    onTestStopped: () => {
      setIsRunning(false);
      setIsPaused(false);
      setRunStartedAt(null);
      showToast("Q&A test stopped", "info");
    },
    onTestPaused: () => {
      setIsPaused(true);
      showToast("Q&A test paused — workers finish in-flight question and wait", "info");
    },
    onTestResumed: () => {
      setIsPaused(false);
      showToast("Q&A test resumed", "success");
    },
    onTestError: (e) => reportError("Q&A Test Error", e),
    onResultsSaved: (message) => showToast(message, "success"),
  });

  const handleConfigChange = (configName: string) => {
    setSelectedConfig(configName);
    setIsConfigured(false);
    if (!configName) {
      ConnectionStatusStore.set("qa_test", "idle");
      return;
    }
    const config = configs.find((c) => c.name === configName);
    if (config) {
      if (!socketService.getSocket()) {
        showToast("Socket connection not established. Please refresh the page.", "error");
        return;
      }
      ConnectionStatusStore.set("qa_test", "configuring");
      socketService.configure(config, "qa_test");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/api/upload-excel`, { method: "POST", body: formData });
      const data = await response.json();
      if (data.error) {
        showToast(`Error: ${data.error}`, "error");
        setFileName("");
        return;
      }
      if (data.data?.length && data.columns) {
        const cols: string[] = data.columns;
        const questionCol = cols.find(
          (c) => c.toLowerCase().includes("frage") || c.toLowerCase().includes("question"),
        );
        const answerCol = cols.find(
          (c) => c.toLowerCase().includes("antwort") || c.toLowerCase().includes("answer"),
        );
        if (questionCol && answerCol) {
          const pairs: QAPair[] = (data.data as Array<Record<string, unknown>>)
            .map((row) => ({
              Frage: String(row[questionCol] ?? ""),
              Antwort: String(row[answerCol] ?? ""),
            }))
            .filter((p) => p.Frage && p.Antwort);
          setQaPairs(pairs);
          setSuiteRestored(false);
          // A fresh upload is ad-hoc until explicitly saved as a suite.
          setActiveSuiteId(null);
          // Persist so a reload / tomorrow's rerun skips the file picker.
          QASuiteStore.save(file.name, pairs);
        } else {
          showToast("Could not find 'Frage' and 'Antwort' columns in Excel file", "error");
        }
      } else {
        showToast("Excel file is empty or has no data", "error");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Error uploading file: ${message}`, "error");
    }
  };

  const handleStartTest = () => {
    if (!selectedConfig) {
      showToast("Please select a configuration", "warning");
      return;
    }
    if (!isConfigured) {
      showToast("Please wait for configuration to complete", "warning");
      return;
    }
    if (qaPairs.length === 0) {
      showToast("Please upload an Excel file with Q&A data", "warning");
      return;
    }
    retryBaseRef.current = null;
    setRunTotal(qaPairs.length);
    socketService.startQATest(qaPairs, promptConfig);
  };

  /** Re-run only the rows that hit widget/backend errors, merging on completion. */
  const handleRetryErrors = () => {
    if (!results || isRunning) return;
    const errored = results.results.filter(
      (r) => r.status === "widget_error" || r.status === "no_response",
    );
    if (errored.length === 0) return;
    if (!isConfigured) {
      showToast("Please wait for configuration to complete", "warning");
      return;
    }
    retryBaseRef.current = results;
    setRunTotal(errored.length);
    socketService.startQATest(
      errored.map((r) => ({ Frage: r.question, Antwort: r.expected_answer })),
      promptConfig,
      errored.map((r) => r.index),
    );
  };

  const handleStopTest = () => socketService.stopQATest();
  const handlePauseTest = () => socketService.pauseQATest();
  const handleResumeTest = () => socketService.resumeQATest();
  const handleSaveResults = () => {
    if (!results) {
      showToast("No results to save", "warning");
      return;
    }
    socketService.saveQATestResults();
  };

  return (
    <div className="bg-white rounded-b-lg shadow-sm p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Q&A Testing Suite</h2>
        <p className="text-sm text-gray-600">
          Upload an Excel file with questions and expected answers to test your chatbot&apos;s responses
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

      <ConfigSection
        configs={configs}
        selectedConfig={selectedConfig}
        isConfigured={isConfigured}
        onConfigChange={handleConfigChange}
      />

      <SuitePanel
        qaPairs={qaPairs}
        fileName={fileName}
        activeSuiteId={activeSuiteId}
        onLoadSuite={(suite) => {
          setQaPairs(suite.pairs);
          setFileName(suite.fileName ?? suite.name);
          setActiveSuiteId(suite.id);
          setSuiteRestored(false);
          QASuiteStore.save(suite.fileName ?? suite.name, suite.pairs, suite.id);
        }}
        onSuiteDeleted={(id) => {
          if (id === activeSuiteId) {
            setActiveSuiteId(null);
            setQaPairs([]);
            setFileName("");
            QASuiteStore.clear();
          }
        }}
      />

      <FileUploadSection
        qaPairs={qaPairs}
        fileName={fileName}
        restored={suiteRestored}
        onFileUpload={handleFileUpload}
        onClearSuite={() => {
          QASuiteStore.clear();
          setQaPairs([]);
          setFileName("");
          setSuiteRestored(false);
          setActiveSuiteId(null);
        }}
      />

      <EvaluationSettings promptConfig={promptConfig} onConfigChange={setPromptConfig} />

      <TestControls
        isRunning={isRunning}
        isPaused={isPaused}
        hasResults={!!results}
        qaPairsCount={qaPairs.length}
        selectedConfig={selectedConfig}
        isConfigured={isConfigured}
        results={results}
        retryableCount={results?.infrastructure_errors ?? 0}
        onStartTest={handleStartTest}
        onStopTest={handleStopTest}
        onPauseTest={handlePauseTest}
        onResumeTest={handleResumeTest}
        onSaveResults={handleSaveResults}
        onRetryErrors={handleRetryErrors}
      />

      {isRunning && (
        <TestProgress
          completed={intermediateResults.length}
          totalTests={runTotal || qaPairs.length}
          startedAt={runStartedAt}
        />
      )}

      {isRunning && intermediateResults.length > 0 && (
        <div>
          <TestResults
            results={{
              total: qaPairs.length,
              satisfactory: intermediateResults.filter((r) => r.is_satisfactory).length,
              failed: intermediateResults.filter((r) => !r.is_satisfactory).length,
              results: intermediateResults,
              model: EVALUATOR_MODEL,
              timestamp: new Date().toISOString(),
            }}
          />
        </div>
      )}

      {!isRunning && results && <TestResults results={results} />}

      {activeSuiteId && (
        <RunHistory
          suiteId={activeSuiteId}
          refreshKey={historyRefresh}
          onViewRun={(stored) => {
            setResults(stored);
            setIntermediateResults([]);
            showToast("Loaded stored run into the results view", "info");
          }}
        />
      )}

      <CompareRunsPanel />
    </div>
  );
}
