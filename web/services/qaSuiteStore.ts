/**
 * Persists the last uploaded Q&A suite (file name + parsed pairs) so a reload
 * or next-day session doesn't start from the file picker. One suite, replaced
 * on every successful upload.
 */
import type { QAPair } from "@/lib/types";

const STORAGE_KEY = "octonomy_testing:lastSuite";
/** Don't burn localStorage quota on huge suites; they re-upload instead. */
const MAX_BYTES = 1_500_000;

export interface StoredSuite {
  fileName: string;
  pairs: QAPair[];
  savedAt: string; // ISO
  /** Server-side suite id when the pairs came from a saved suite. */
  suiteId?: string | null;
}

export const QASuiteStore = {
  save(fileName: string, pairs: QAPair[], suiteId?: string | null): boolean {
    if (typeof window === "undefined") return false;
    try {
      const payload = JSON.stringify({
        fileName,
        pairs,
        savedAt: new Date().toISOString(),
        suiteId: suiteId ?? null,
      } satisfies StoredSuite);
      if (payload.length > MAX_BYTES) return false;
      localStorage.setItem(STORAGE_KEY, payload);
      return true;
    } catch {
      return false;
    }
  },

  load(): StoredSuite | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSuite;
      if (!parsed || typeof parsed.fileName !== "string" || !Array.isArray(parsed.pairs)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  clear(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best effort
    }
  },
};
