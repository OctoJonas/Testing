/**
 * Connection Pool Manager — per-session, per-context Octonomy clients.
 *
 * Ported from testing/backend/services/connection_pool.py. Node is
 * single-threaded so we don't need explicit mutexes; pool mutations happen
 * inside one synchronous tick. Concurrent `getClient` callers that both
 * trigger auto-connect await the same in-flight connect Promise via
 * `_inflightConnects`.
 */

import type { ClientConfigInit, OctonomyClientFactory, OctonomyClientLike } from "./octonomy/types";

export const ConnectionContext = {
  CHAT: "chat",
  QA_TEST: "qa_test",
  AUTONOMOUS: "autonomous",
} as const;
export type ConnectionContextValue = (typeof ConnectionContext)[keyof typeof ConnectionContext];

const DEFAULT_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 3600);

class ConnectionPoolManager {
  /** session_id → context → client */
  private pools = new Map<string, Map<string, OctonomyClientLike>>();
  /** session_id → context → config */
  private configs = new Map<string, Map<string, ClientConfigInit>>();
  /** session_id → monotonic ms (last touch — for TTL eviction) */
  private lastSeen = new Map<string, number>();
  /** session_id|context → in-flight connect promise (deduplicates concurrent auto-connects) */
  private inflightConnects = new Map<string, Promise<OctonomyClientLike | null>>();
  /** Optional injected factory — see lib/octonomy/factory.ts. */
  private factory: OctonomyClientFactory | null = null;

  setFactory(factory: OctonomyClientFactory): void {
    this.factory = factory;
  }

  private touch(sessionId: string): void {
    this.lastSeen.set(sessionId, performance.now());
  }

  setConfig(sessionId: string, config: ClientConfigInit, context?: string): void {
    let bag = this.configs.get(sessionId);
    if (!bag) {
      bag = new Map();
      this.configs.set(sessionId, bag);
    }
    bag.set(context ?? "_default", config);
    this.touch(sessionId);
  }

  getConfig(sessionId: string, context?: string): ClientConfigInit | null {
    const bag = this.configs.get(sessionId);
    if (!bag) return null;
    if (context && bag.has(context)) return bag.get(context)!;
    // Fall back to base context for derived contexts (e.g. qa_test_w0 → qa_test)
    if (context && context.includes("_")) {
      const baseContext = context.split("_").slice(0, 2).join("_"); // qa_test_w0 → qa_test
      if (bag.has(baseContext)) return bag.get(baseContext)!;
      const base = context.split("_")[0];
      if (bag.has(base)) return bag.get(base)!;
    }
    return bag.get("_default") ?? null;
  }

  hasConfig(sessionId: string, context?: string): boolean {
    const bag = this.configs.get(sessionId);
    if (!bag || bag.size === 0) return false;
    if (context) return bag.has(context) || bag.has("_default");
    return bag.has("_default") || bag.size > 0;
  }

  /**
   * Retrieve or create a client for `(sessionId, context)`.
   *
   * - `autoCreate`: instantiate a new client if none exists.
   * - `autoConnect`: also call `authenticate()` + `connect()` before returning.
   *
   * Returns null when `autoCreate=false` and no client exists. Throws when
   * `autoCreate=true` but no config has been set for the session.
   */
  async getClient(
    sessionId: string,
    context: string,
    { autoCreate = false, autoConnect = false }: { autoCreate?: boolean; autoConnect?: boolean } = {},
  ): Promise<OctonomyClientLike | null> {
    let pool = this.pools.get(sessionId);
    if (!pool) {
      pool = new Map();
      this.pools.set(sessionId, pool);
    }
    this.touch(sessionId);

    const existing = pool.get(context);
    if (existing) return existing;
    if (!autoCreate) return null;

    const cfg = this.getConfig(sessionId, context);
    if (!cfg) {
      throw new Error(
        `No configuration found for session ${sessionId}, context ${context}. ` +
          `Call setConfig() first.`,
      );
    }
    if (!this.factory) {
      throw new Error("Connection pool: no client factory registered. Call setFactory() at startup.");
    }

    const client = this.factory(cfg);
    pool.set(context, client);

    if (!autoConnect) return client;

    // Deduplicate concurrent connect attempts on the same key so two callers
    // doing auto-connect in parallel only run auth/connect once.
    const key = `${sessionId}|${context}`;
    let inflight = this.inflightConnects.get(key);
    if (!inflight) {
      inflight = (async () => {
        try {
          if (!(await client.authenticate())) {
            throw new Error("Authentication returned false");
          }
          if (!(await client.connect())) {
            throw new Error("Connection returned false");
          }
          return client;
        } catch (err) {
          // Failed connect → remove from pool so next attempt can retry cleanly.
          pool!.delete(context);
          throw err;
        } finally {
          this.inflightConnects.delete(key);
        }
      })();
      this.inflightConnects.set(key, inflight);
    }
    return inflight;
  }

  async disconnectContext(sessionId: string, context: string): Promise<boolean> {
    const pool = this.pools.get(sessionId);
    if (!pool) return false;
    const client = pool.get(context);
    if (!client) return false;
    pool.delete(context);
    try {
      await client.disconnect();
    } catch (err) {
      console.warn(`[pool] error disconnecting ${context} for session=${sessionId}:`, err);
    }
    return true;
  }

  async disconnectSession(sessionId: string): Promise<number> {
    const pool = this.pools.get(sessionId);
    let count = 0;
    if (pool) {
      for (const [ctx, client] of pool) {
        try {
          await client.disconnect();
          count++;
        } catch (err) {
          console.warn(`[pool] error disconnecting ${ctx}:`, err);
        }
      }
      this.pools.delete(sessionId);
    }
    this.configs.delete(sessionId);
    this.lastSeen.delete(sessionId);
    return count;
  }

  /** Evict sessions that haven't been touched within `ttlSeconds`. */
  async sweepIdleSessions(ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<number> {
    const cutoff = performance.now() - ttlSeconds * 1000;
    const stale: string[] = [];
    for (const [sid, last] of this.lastSeen) if (last < cutoff) stale.push(sid);
    let evicted = 0;
    for (const sid of stale) {
      try {
        await this.disconnectSession(sid);
        evicted++;
      } catch {
        // sweeper must not raise
      }
    }
    if (evicted) console.log(`[pool] sweeper evicted ${evicted} idle session(s) (ttl=${ttlSeconds}s)`);
    return evicted;
  }

  isConnected(sessionId: string, context: string): boolean {
    return this.pools.get(sessionId)?.get(context)?.isConnected() ?? false;
  }

  getAllContexts(sessionId: string): string[] {
    const pool = this.pools.get(sessionId);
    return pool ? [...pool.keys()] : [];
  }

  getSessionStats(sessionId: string): {
    sessionId: string;
    hasConfig: boolean;
    contexts: Record<string, { connected: boolean; conversationId: string | null }>;
    totalContexts: number;
  } {
    const pool = this.pools.get(sessionId);
    const contexts: Record<string, { connected: boolean; conversationId: string | null }> = {};
    if (pool) {
      for (const [ctx, client] of pool) {
        contexts[ctx] = {
          connected: client.isConnected(),
          conversationId: client.conversationManager?.conversationId ?? null,
        };
      }
    }
    return {
      sessionId,
      hasConfig: this.configs.has(sessionId),
      contexts,
      totalContexts: pool?.size ?? 0,
    };
  }
}

// Singleton — one pool per Node process.
const _pool = new ConnectionPoolManager();
export const connectionPool = _pool;

// Module-level shortcuts that match the Python module-level functions.
export const setConfig = (sid: string, cfg: ClientConfigInit, ctx?: string) => _pool.setConfig(sid, cfg, ctx);
export const getConfig = (sid: string, ctx?: string) => _pool.getConfig(sid, ctx);
export const hasConfig = (sid: string, ctx?: string) => _pool.hasConfig(sid, ctx);
export const getClient = (
  sid: string,
  ctx: string,
  opts?: { autoCreate?: boolean; autoConnect?: boolean },
) => _pool.getClient(sid, ctx, opts);
export const disconnectContext = (sid: string, ctx: string) => _pool.disconnectContext(sid, ctx);
export const disconnectSession = (sid: string) => _pool.disconnectSession(sid);
export const getSessionStats = (sid: string) => _pool.getSessionStats(sid);
export const sweepIdleSessions = (ttl?: number) => _pool.sweepIdleSessions(ttl);

// Sweeper — spun up by server.ts at startup. Replaces the stub from Phase 1.
let sweepHandle: NodeJS.Timeout | null = null;

export function startSweeper(): void {
  if (sweepHandle) return;
  const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 3600);
  const intervalMs = Math.max(60_000, (ttlSeconds * 1000) / 4);
  sweepHandle = setInterval(() => {
    void _pool.sweepIdleSessions(ttlSeconds);
  }, intervalMs);
  sweepHandle.unref?.();
}

export function stopSweeper(): void {
  if (sweepHandle) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
}
