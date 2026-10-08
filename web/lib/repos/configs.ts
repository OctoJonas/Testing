/**
 * Server-persisted widget configs, keyed by name (the identifier the whole
 * UI uses). Shared by everyone behind the PIN gate, same SQLite volume as
 * suites/runs.
 */
import { getDb } from "../db";
import type { Config } from "../types";

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS widget_configs (
      name TEXT PRIMARY KEY,
      widget_id TEXT NOT NULL,
      base_url TEXT NOT NULL,
      origin TEXT NOT NULL,
      referer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function toConfig(r: Record<string, unknown>): Config {
  return {
    name: r.name as string,
    widgetId: r.widget_id as string,
    baseUrl: r.base_url as string,
    origin: r.origin as string,
    referer: r.referer as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  } as Config;
}

export function listConfigs(): Config[] {
  ensureTable();
  const rows = getDb()
    .prepare("SELECT * FROM widget_configs ORDER BY name")
    .all() as Array<Record<string, unknown>>;
  return rows.map(toConfig);
}

export function upsertConfig(cfg: {
  name: string;
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
}): Config {
  ensureTable();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO widget_configs (name, widget_id, base_url, origin, referer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         widget_id = excluded.widget_id,
         base_url = excluded.base_url,
         origin = excluded.origin,
         referer = excluded.referer,
         updated_at = excluded.updated_at`,
    )
    .run(cfg.name, cfg.widgetId, cfg.baseUrl, cfg.origin, cfg.referer, now, now);
  const row = getDb().prepare("SELECT * FROM widget_configs WHERE name = ?").get(cfg.name) as Record<
    string,
    unknown
  >;
  return toConfig(row);
}

export function deleteConfig(name: string): boolean {
  ensureTable();
  const res = getDb().prepare("DELETE FROM widget_configs WHERE name = ?").run(name);
  return Number(res.changes) > 0;
}
