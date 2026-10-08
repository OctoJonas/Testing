/**
 * localStorage-backed archive of recent Q&A test runs, used by the
 * comparison panel. Each run is identified by its timestamp + an auto-name.
 *
 * Capped at the most recent 10 runs to avoid blowing past the 5MB
 * localStorage budget when result blobs include long widget responses.
 */
import type { QATestResults } from "@/lib/types";

const STORAGE_KEY = "octonomy_testing:qaRuns";
const MAX_RUNS = 10;

export interface ArchivedRun {
  id: string;
  label: string;
  savedAt: string; // ISO
  results: QATestResults;
}

type Listener = (runs: ArchivedRun[]) => void;
const listeners = new Set<Listener>();

function read(): ArchivedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ArchivedRun[]) : [];
  } catch {
    return [];
  }
}

export type WriteStatus = "ok" | "trimmed" | "failed";

function write(runs: ArchivedRun[]): WriteStatus {
  if (typeof window === "undefined") return "ok";
  let status: WriteStatus = "ok";
  let stored = runs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (err) {
    // Quota likely; trim aggressively and retry once.
    console.warn("[qaRunArchive] write failed, trimming:", err);
    stored = runs.slice(-3);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      status = "trimmed";
    } catch {
      status = "failed";
    }
  }
  // Notify with what actually persisted, so the Compare panel stays in sync.
  for (const l of listeners) {
    try {
      l(status === "failed" ? read() : stored);
    } catch {
      // ignore
    }
  }
  return status;
}

export const QARunArchive = {
  list(): ArchivedRun[] {
    // Newest first.
    return read().slice().reverse();
  },
  archive(results: QATestResults, label?: string): { run: ArchivedRun; status: WriteStatus } {
    const runs = read();
    const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const savedAt = new Date().toISOString();
    const finalLabel = label ?? `${new Date(savedAt).toLocaleString()} · ${results.total} questions`;
    const run: ArchivedRun = { id, label: finalLabel, savedAt, results };
    runs.push(run);
    while (runs.length > MAX_RUNS) runs.shift();
    const status = write(runs);
    return { run, status };
  },
  remove(id: string): void {
    write(read().filter((r) => r.id !== id));
  },
  clear(): void {
    write([]);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
