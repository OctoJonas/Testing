import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QARunArchive } from "@/services/qaRunArchive";
import type { QATestResults } from "@/lib/types";

/** Minimal in-memory localStorage whose setItem can be made to throw (quota). */
class FakeStorage {
  private store = new Map<string, string>();
  failNext = false;
  failAll = false;
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    if (this.failAll || this.failNext) {
      this.failNext = false;
      throw new Error("QuotaExceededError");
    }
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

const sampleResults = (): QATestResults =>
  ({
    total: 1,
    satisfactory: 1,
    failed: 0,
    results: [],
    model: "claude-sonnet-4-5",
    timestamp: "2026-01-01T00:00:00.000Z",
  }) as unknown as QATestResults;

let fake: FakeStorage;

beforeEach(() => {
  fake = new FakeStorage();
  (globalThis as unknown as { window: unknown }).window = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = fake;
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("QARunArchive.archive", () => {
  it("persists a run and reports ok", () => {
    const { status, run } = QARunArchive.archive(sampleResults());
    expect(status).toBe("ok");
    expect(run.id).toMatch(/^run-/);
    expect(QARunArchive.list()).toHaveLength(1);
  });

  it("reports 'trimmed' when the first write hits quota but the trimmed retry succeeds", () => {
    fake.failNext = true;
    const { status } = QARunArchive.archive(sampleResults());
    expect(status).toBe("trimmed");
  });

  it("reports 'failed' when even the trimmed retry hits quota", () => {
    fake.failAll = true;
    const { status } = QARunArchive.archive(sampleResults());
    expect(status).toBe("failed");
  });

  it("keeps at most MAX_RUNS (10) entries, newest first", () => {
    for (let i = 0; i < 12; i++) QARunArchive.archive(sampleResults(), `run-${i}`);
    const list = QARunArchive.list();
    expect(list).toHaveLength(10);
    expect(list[0].label).toBe("run-11"); // newest first
  });
});
