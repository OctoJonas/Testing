/**
 * Run history: every completed (possibly retry-merged) QA run, linked to its
 * suite. Summaries power the trend view; the full results blob is loaded
 * only when a single run is opened.
 */
import { randomUUID } from "node:crypto";

import { getDb } from "../db";
import type { QATestResults } from "../types";

/** Keep history bounded — the volume is small and old runs lose value. */
const MAX_RUNS_PER_SUITE = Number(process.env.MAX_RUNS_PER_SUITE ?? 200);

export interface RunSummary {
  id: string;
  suiteId: string | null;
  configName: string | null;
  startedAt: string;
  total: number;
  passed: number;
  failed: number;
  infraErrors: number;
  threshold: number | null;
  model: string | null;
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
}

function toSummary(r: Record<string, unknown>): RunSummary {
  return {
    id: r.id as string,
    suiteId: (r.suite_id as string | null) ?? null,
    configName: (r.config_name as string | null) ?? null,
    startedAt: r.started_at as string,
    total: Number(r.total),
    passed: Number(r.passed),
    failed: Number(r.failed),
    infraErrors: Number(r.infra_errors),
    threshold: r.threshold === null ? null : Number(r.threshold),
    model: (r.model as string | null) ?? null,
    latencyMedianMs: r.latency_median_ms === null ? null : Number(r.latency_median_ms),
    latencyP95Ms: r.latency_p95_ms === null ? null : Number(r.latency_p95_ms),
  };
}

export function saveRun(args: {
  suiteId: string | null;
  configName?: string | null;
  results: QATestResults;
}): RunSummary {
  const db = getDb();
  const id = randomUUID();
  const r = args.results;
  db.prepare(
    `INSERT INTO runs
       (id, suite_id, config_name, started_at, total, passed, failed, infra_errors,
        threshold, model, latency_median_ms, latency_p95_ms, results_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.suiteId,
    args.configName ?? null,
    r.timestamp || new Date().toISOString(),
    r.total,
    r.satisfactory,
    r.failed,
    r.infrastructure_errors ?? 0,
    r.threshold ?? null,
    r.model ?? null,
    r.latency?.median_ms ?? null,
    r.latency?.p95_ms ?? null,
    JSON.stringify(r),
  );

  if (args.suiteId) pruneRuns(args.suiteId);
  return toSummary(
    db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

function pruneRuns(suiteId: string): void {
  getDb()
    .prepare(
      `DELETE FROM runs WHERE suite_id = ? AND id NOT IN (
         SELECT id FROM runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT ?
       )`,
    )
    .run(suiteId, suiteId, MAX_RUNS_PER_SUITE);
}

/** Newest first. */
export function listRunsForSuite(suiteId: string, limit = 50): RunSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, suite_id, config_name, started_at, total, passed, failed, infra_errors,
              threshold, model, latency_median_ms, latency_p95_ms
       FROM runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT ?`,
    )
    .all(suiteId, limit) as Array<Record<string, unknown>>;
  return rows.map(toSummary);
}

export function getRunResults(id: string): QATestResults | null {
  const r = getDb().prepare("SELECT results_json FROM runs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  try {
    return JSON.parse(r.results_json as string) as QATestResults;
  } catch {
    return null;
  }
}

export function deleteRun(id: string): boolean {
  const res = getDb().prepare("DELETE FROM runs WHERE id = ?").run(id);
  return Number(res.changes) > 0;
}
