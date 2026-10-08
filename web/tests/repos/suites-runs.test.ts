import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, initDb } from "@/lib/db";
import {
  createSuite,
  deleteSuite,
  findSuiteByName,
  getSuite,
  listSuites,
  updateSuite,
} from "@/lib/repos/suites";
import { deleteRun, getRunResults, listRunsForSuite, saveRun } from "@/lib/repos/runs";
import type { QATestResults } from "@/lib/types";

const pairs = [
  { Frage: "Was ist X?", Antwort: "X ist Y." },
  { Frage: "Wie geht Z?", Antwort: "So geht Z." },
];

const sampleResults = (over: Partial<QATestResults> = {}): QATestResults => ({
  total: 2,
  satisfactory: 1,
  failed: 1,
  infrastructure_errors: 0,
  threshold: 0.7,
  latency: { median_ms: 2_000, p95_ms: 5_000, max_ms: 6_000 },
  results: [],
  model: "claude-sonnet-4-5",
  timestamp: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("suites repo", () => {
  it("creates, lists, and fetches suites with pairs in order", () => {
    const suite = createSuite({ name: "Helpdesk DE", fileName: "qa.xlsx", pairs });
    expect(suite.pairCount).toBe(2);
    expect(listSuites().map((s) => s.name)).toEqual(["Helpdesk DE"]);
    const fetched = getSuite(suite.id)!;
    expect(fetched.pairs).toEqual(pairs);
  });

  it("finds suites by name and enforces uniqueness at the route layer", () => {
    createSuite({ name: "A", pairs });
    expect(findSuiteByName("A")?.name).toBe("A");
    expect(findSuiteByName("missing")).toBeNull();
  });

  it("updates pairs in place", () => {
    const suite = createSuite({ name: "A", pairs });
    const updated = updateSuite(suite.id, {
      pairs: [{ Frage: "Neu?", Antwort: "Ja." }],
    })!;
    expect(updated.pairCount).toBe(1);
    expect(updated.pairs[0].Frage).toBe("Neu?");
  });

  it("delete cascades to pairs and runs", () => {
    const suite = createSuite({ name: "A", pairs });
    saveRun({ suiteId: suite.id, configName: "cfg", results: sampleResults() });
    expect(deleteSuite(suite.id)).toBe(true);
    expect(getSuite(suite.id)).toBeNull();
    expect(listRunsForSuite(suite.id)).toEqual([]);
  });
});

describe("runs repo", () => {
  it("saves a run and round-trips the full results blob", () => {
    const suite = createSuite({ name: "A", pairs });
    const run = saveRun({ suiteId: suite.id, configName: "talentship", results: sampleResults() });
    expect(run.passed).toBe(1);
    expect(run.latencyMedianMs).toBe(2_000);
    const stored = getRunResults(run.id)!;
    expect(stored.model).toBe("claude-sonnet-4-5");
  });

  it("lists runs newest first", () => {
    const suite = createSuite({ name: "A", pairs });
    saveRun({ suiteId: suite.id, results: sampleResults({ timestamp: "2026-06-01T00:00:00Z" }) });
    saveRun({ suiteId: suite.id, results: sampleResults({ timestamp: "2026-06-09T00:00:00Z" }) });
    const runs = listRunsForSuite(suite.id);
    expect(runs).toHaveLength(2);
    expect(runs[0].startedAt > runs[1].startedAt).toBe(true);
  });

  it("deletes a single run", () => {
    const suite = createSuite({ name: "A", pairs });
    const run = saveRun({ suiteId: suite.id, results: sampleResults() });
    expect(deleteRun(run.id)).toBe(true);
    expect(getRunResults(run.id)).toBeNull();
  });
});
