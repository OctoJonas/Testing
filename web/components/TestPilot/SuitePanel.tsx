"use client";

import { useCallback, useEffect, useState } from "react";

import { SuitesApi, type SuiteSummary } from "@/services/suitesApi";
import { useToast } from "@/contexts/useToast";
import type { QAPair } from "@/lib/types";

interface SuitePanelProps {
  /** Pairs currently loaded in the tab (uploaded or from a suite). */
  qaPairs: QAPair[];
  fileName: string;
  activeSuiteId: string | null;
  /** Load a suite's pairs into the tab. */
  onLoadSuite: (suite: {
    id: string;
    name: string;
    fileName: string | null;
    pairs: QAPair[];
  }) => void;
  onSuiteDeleted: (id: string) => void;
}

/**
 * Server-persisted test suites: save the currently loaded Q&A pairs under a
 * name, reload them on any machine/browser, edit pairs in place.
 */
export default function SuitePanel({
  qaPairs,
  fileName,
  activeSuiteId,
  onLoadSuite,
  onSuiteDeleted,
}: SuitePanelProps) {
  const { showToast } = useToast();
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftPairs, setDraftPairs] = useState<QAPair[]>([]);

  const refresh = useCallback(() => {
    SuitesApi.list()
      .then(setSuites)
      .catch((err) => console.warn("[SuitePanel] list failed:", err));
  }, []);
  useEffect(refresh, [refresh]);

  const activeSuite = suites.find((s) => s.id === activeSuiteId) ?? null;

  const handleLoad = async (id: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const suite = await SuitesApi.get(id);
      onLoadSuite(suite);
      setEditing(false);
      showToast(
        `Loaded suite "${suite.name}" (${suite.pairs.length} questions)`,
        "success",
      );
    } catch (err) {
      showToast(`Failed to load suite: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const name = (
      saveName ||
      fileName.replace(/\.(xlsx|xls)$/i, "") ||
      ""
    ).trim();
    if (!name) {
      showToast("Give the suite a name first", "warning");
      return;
    }
    if (qaPairs.length === 0) {
      showToast("Upload or load Q&A pairs first", "warning");
      return;
    }
    setBusy(true);
    try {
      let suite;
      try {
        suite = await SuitesApi.create({ name, fileName, pairs: qaPairs });
      } catch (err) {
        if ((err as { status?: number }).status === 409) {
          if (
            !window.confirm(`Suite "${name}" exists. Overwrite its questions?`)
          )
            return;
          suite = await SuitesApi.create({
            name,
            fileName,
            pairs: qaPairs,
            overwrite: true,
          });
        } else {
          throw err;
        }
      }
      onLoadSuite(suite);
      setSaveName("");
      refresh();
      showToast(
        `Suite "${suite.name}" saved (${suite.pairs.length} questions)`,
        "success",
      );
    } catch (err) {
      showToast(`Failed to save suite: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activeSuite) return;
    if (
      !window.confirm(`Delete suite "${activeSuite.name}" and its run history?`)
    )
      return;
    setBusy(true);
    try {
      await SuitesApi.remove(activeSuite.id);
      onSuiteDeleted(activeSuite.id);
      setEditing(false);
      refresh();
      showToast(`Suite "${activeSuite.name}" deleted`, "info");
    } catch (err) {
      showToast(`Failed to delete suite: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setDraftPairs(qaPairs.map((p) => ({ ...p })));
    setEditing(true);
  };

  const handleSaveEdits = async () => {
    if (!activeSuiteId) return;
    const cleaned = draftPairs.filter(
      (p) => p.Frage.trim() && p.Antwort.trim(),
    );
    if (cleaned.length === 0) {
      showToast("A suite needs at least one complete Q&A pair", "warning");
      return;
    }
    setBusy(true);
    try {
      const suite = await SuitesApi.update(activeSuiteId, { pairs: cleaned });
      onLoadSuite(suite);
      setEditing(false);
      refresh();
      showToast(`Suite updated (${suite.pairs.length} questions)`, "success");
    } catch (err) {
      showToast(`Failed to update suite: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="suite-select"
          className="text-sm font-semibold text-gray-700"
        >
          Test Suite:
        </label>
        <select
          id="suite-select"
          value={activeSuiteId ?? ""}
          onChange={(e) => void handleLoad(e.target.value)}
          disabled={busy}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 flex-1 min-w-44"
        >
          <option value="">— none (ad-hoc upload) —</option>
          {suites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.pairCount})
            </option>
          ))}
        </select>

        {activeSuite ? (
          <>
            <button
              type="button"
              onClick={editing ? handleSaveEdits : startEditing}
              disabled={busy}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {editing ? "Save changes" : "Edit pairs"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-700 underline underline-offset-2 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        ) : (
          qaPairs.length > 0 && (
            <span className="flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={
                  fileName.replace(/\.(xlsx|xls)$/i, "") || "Suite name"
                }
                aria-label="New suite name"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-44"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save as suite
              </button>
            </span>
          )
        )}
      </div>

      {editing && (
        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto bg-white border border-indigo-200 rounded-lg p-4">
          {draftPairs.map((pair, idx) => (
            <div
              key={idx}
              className="border-b border-gray-200 pb-3 last:border-0"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">
                  Q&A Pair #{idx + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Remove pair ${idx + 1}`}
                  onClick={() =>
                    setDraftPairs((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  ✕ remove
                </button>
              </div>
              <textarea
                value={pair.Frage}
                onChange={(e) =>
                  setDraftPairs((prev) =>
                    prev.map((p, i) =>
                      i === idx ? { ...p, Frage: e.target.value } : p,
                    ),
                  )
                }
                rows={2}
                aria-label={`Question ${idx + 1}`}
                placeholder="Frage"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-1"
              />
              <textarea
                value={pair.Antwort}
                onChange={(e) =>
                  setDraftPairs((prev) =>
                    prev.map((p, i) =>
                      i === idx ? { ...p, Antwort: e.target.value } : p,
                    ),
                  )
                }
                rows={3}
                aria-label={`Expected answer ${idx + 1}`}
                placeholder="Erwartete Antwort"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraftPairs((prev) => [...prev, { Frage: "", Antwort: "" }])
            }
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add pair
          </button>
        </div>
      )}
    </div>
  );
}
