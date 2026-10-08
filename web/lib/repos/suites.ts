/**
 * Suite storage: a named, editable set of Q&A pairs that outlives the
 * uploaded Excel file and is shared by everyone using the deployment.
 */
import { randomUUID } from "node:crypto";

import { getDb } from "../db";
import type { QAPair } from "../types";

export interface SuiteSummary {
  id: string;
  name: string;
  fileName: string | null;
  pairCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Suite extends SuiteSummary {
  pairs: QAPair[];
}

export function listSuites(): SuiteSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.file_name, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM suite_pairs p WHERE p.suite_id = s.id) AS pair_count
       FROM suites s ORDER BY s.updated_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    fileName: (r.file_name as string | null) ?? null,
    pairCount: Number(r.pair_count),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export function getSuite(id: string): Suite | null {
  const db = getDb();
  const s = db.prepare("SELECT * FROM suites WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!s) return null;
  const pairs = db
    .prepare("SELECT frage, antwort FROM suite_pairs WHERE suite_id = ? ORDER BY idx")
    .all(id) as Array<Record<string, unknown>>;
  return {
    id: s.id as string,
    name: s.name as string,
    fileName: (s.file_name as string | null) ?? null,
    pairCount: pairs.length,
    createdAt: s.created_at as string,
    updatedAt: s.updated_at as string,
    pairs: pairs.map((p) => ({ Frage: p.frage as string, Antwort: p.antwort as string })),
  };
}

export function findSuiteByName(name: string): SuiteSummary | null {
  const r = getDb().prepare("SELECT id FROM suites WHERE name = ?").get(name) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  const full = getSuite(r.id as string);
  return full;
}

function writePairs(suiteId: string, pairs: QAPair[]): void {
  const db = getDb();
  db.prepare("DELETE FROM suite_pairs WHERE suite_id = ?").run(suiteId);
  const insert = db.prepare(
    "INSERT INTO suite_pairs (suite_id, idx, frage, antwort) VALUES (?, ?, ?, ?)",
  );
  pairs.forEach((p, i) => insert.run(suiteId, i, p.Frage, p.Antwort));
}

export function createSuite(args: {
  name: string;
  fileName?: string | null;
  pairs: QAPair[];
}): Suite {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO suites (id, name, file_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, args.name, args.fileName ?? null, now, now);
  writePairs(id, args.pairs);
  return getSuite(id)!;
}

export function updateSuite(
  id: string,
  args: { name?: string; fileName?: string | null; pairs?: QAPair[] },
): Suite | null {
  const db = getDb();
  const existing = getSuite(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE suites SET name = ?, file_name = ?, updated_at = ? WHERE id = ?").run(
    args.name ?? existing.name,
    args.fileName === undefined ? existing.fileName : args.fileName,
    now,
    id,
  );
  if (args.pairs) writePairs(id, args.pairs);
  return getSuite(id);
}

export function deleteSuite(id: string): boolean {
  // Runs cascade-delete with the suite (history is meaningless without it).
  const res = getDb().prepare("DELETE FROM suites WHERE id = ?").run(id);
  return Number(res.changes) > 0;
}
