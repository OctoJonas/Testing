/**
 * SQLite persistence for suites + run history, via Node's built-in
 * `node:sqlite` (no native build step in Docker). Single-machine app →
 * a single synchronous connection is the simplest correct model.
 *
 * The database lives on the Fly volume (`DATA_DIR=/data` in production,
 * `.data/` locally, `:memory:` in tests via `initDb`).
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS suites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  file_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suite_pairs (
  suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  frage TEXT NOT NULL,
  antwort TEXT NOT NULL,
  PRIMARY KEY (suite_id, idx)
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT REFERENCES suites(id) ON DELETE CASCADE,
  config_name TEXT,
  started_at TEXT NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  infra_errors INTEGER NOT NULL DEFAULT 0,
  threshold REAL,
  model TEXT,
  latency_median_ms INTEGER,
  latency_p95_ms INTEGER,
  results_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_suite_started ON runs(suite_id, started_at);
`;

let db: DatabaseSync | null = null;

/** Open (or create) a database at `location` and apply the schema. */
export function initDb(location?: string): DatabaseSync {
  if (db) return db;
  const target =
    location ??
    path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "testing.db");
  if (target !== ":memory:") {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }
  db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): DatabaseSync {
  return db ?? initDb();
}

/** Test hook — drop the singleton so the next getDb() starts fresh. */
export function closeDb(): void {
  try {
    db?.close();
  } catch {
    // already closed
  }
  db = null;
}
