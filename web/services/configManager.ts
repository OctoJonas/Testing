/**
 * Widget configs — server-persisted (shared SQLite, see /api/configs) with a
 * localStorage cache for instant first paint and offline fallback.
 *
 * The synchronous facade (getConfigs/saveConfig/deleteConfig/subscribe) is
 * unchanged from the localStorage-only era so callers don't care about the
 * persistence model: reads hit the in-memory cache, writes apply optimistically
 * and write through to the server in the background.
 *
 * `sync()` (called once at app boot) pulls the server list and pushes any
 * local-only configs up — the one-time migration path for browsers that saved
 * configs before server persistence existed.
 *
 * `lastUsedConfig` stays per-browser on purpose: it's a personal preference,
 * not shared state.
 */
import type { Config } from "@/lib/types";
import { API_URL } from "./api";

const STORAGE_KEY = "octonomy_testing:savedConfigs";
const LAST_USED_KEY = "octonomy_testing:lastUsedConfig";
const LEGACY_STORAGE_KEY = "savedConfigs";
const LEGACY_LAST_USED_KEY = "lastUsedConfig";

type Listener = (configs: Config[]) => void;
const listeners = new Set<Listener>();

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readLocal(): Config[] {
  const stored = readRaw(STORAGE_KEY) ?? readRaw(LEGACY_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as Config[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(configs: Config[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // cache only — server remains the source of truth
  }
}

/** In-memory cache backing the synchronous reads. */
let cache: Config[] = typeof window === "undefined" ? [] : readLocal();
let synced = false;

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(cache);
    } catch {
      // listeners shouldn't break each other
    }
  }
}

function setCache(configs: Config[]): void {
  cache = configs;
  writeLocal(configs);
  notify();
}

async function pushToServer(config: Config): Promise<void> {
  await fetch(`${API_URL}/api/configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: config.name,
      widgetId: config.widgetId,
      baseUrl: config.baseUrl,
      origin: config.origin,
      referer: config.referer,
    }),
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

/** Test hook — clear the in-memory cache and sync flag. */
export function resetConfigCacheForTests(): void {
  cache = [];
  synced = false;
}

/** Pure merge: server wins on name clashes; local-only entries are kept (and uploaded). */
export function mergeConfigs(server: Config[], local: Config[]): { merged: Config[]; localOnly: Config[] } {
  const serverNames = new Set(server.map((c) => c.name));
  const localOnly = local.filter((c) => c.name && !serverNames.has(c.name));
  return { merged: [...server, ...localOnly], localOnly };
}

export const ConfigManager = {
  getConfigs(): Config[] {
    return cache;
  },

  /**
   * One-time server sync at boot: download the shared list, upload anything
   * that only exists in this browser, then serve the merged view.
   */
  async sync(): Promise<void> {
    if (synced || typeof window === "undefined") return;
    try {
      const res = await fetch(`${API_URL}/api/configs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { configs: server } = (await res.json()) as { configs: Config[] };
      const { merged, localOnly } = mergeConfigs(server, readLocal());
      setCache(merged);
      synced = true;
      // Migrate this browser's pre-server configs up, best-effort.
      for (const cfg of localOnly) {
        pushToServer(cfg).catch((err) =>
          console.warn(`[configManager] migration of "${cfg.name}" failed:`, err),
        );
      }
    } catch (err) {
      // Offline / server hiccup: keep the local cache and try again next boot.
      console.warn("[configManager] server sync failed; using local cache:", err);
    }
  },

  saveConfig(config: Config): void {
    const idx = cache.findIndex((c) => c.name === config.name);
    const next = [...cache];
    if (idx !== -1) next[idx] = { ...config, updatedAt: new Date().toISOString() };
    else next.push({ ...config, createdAt: config.createdAt ?? new Date().toISOString() });
    setCache(next);
    pushToServer(config).catch((err) =>
      console.warn(`[configManager] server save of "${config.name}" failed:`, err),
    );
  },

  deleteConfig(name: string): void {
    setCache(cache.filter((c) => c.name !== name));
    fetch(`${API_URL}/api/configs/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(
      (err) => console.warn(`[configManager] server delete of "${name}" failed:`, err),
    );
  },

  getConfigByName(name: string): Config | undefined {
    return cache.find((c) => c.name === name);
  },

  setLastUsedConfig(name: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(LAST_USED_KEY, name);
  },

  getLastUsedConfig(): string | null {
    const stored = readRaw(LAST_USED_KEY);
    if (stored) return stored;
    const legacy = readRaw(LEGACY_LAST_USED_KEY);
    if (legacy && typeof window !== "undefined") {
      localStorage.setItem(LAST_USED_KEY, legacy);
      return legacy;
    }
    return null;
  },

  /** Legacy no-op kept so existing callers don't break. */
  initializeDefaultConfig(): void {
    /* intentionally empty */
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
