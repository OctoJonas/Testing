/**
 * Stable session identity + graceful teardown.
 *
 * Historically every piece of per-connection server state (connection pool,
 * chat history, QA/autonomous run state, rate-limit buckets) was keyed by
 * `socket.id`. Socket.IO assigns a NEW `socket.id` on every reconnect, so any
 * transient drop (network blip, Fly machine cold start, deploy) silently
 * orphaned the whole session — the classic "stuck on Configuring" symptom and
 * lost test runs.
 *
 * The browser now sends a stable per-tab id in the handshake auth
 * (`auth.sessionId`), which Socket.IO resends automatically on reconnect. We
 * key all state by that id and join each socket to a room named after it, so
 * `io.to(sid).emit(...)` keeps reaching the live socket across reconnects.
 *
 * On disconnect we DON'T tear the session down immediately; we wait out a
 * grace window. If the same session reconnects within it, the teardown is
 * cancelled and any in-flight run keeps streaming to the new socket. Only a
 * session that stays gone past the grace window is torn down. Truly abandoned
 * sessions are also caught by the connection-pool idle sweeper (TTL).
 */
import type { Socket } from "socket.io";

export const SESSION_GRACE_MS = Math.max(
  0,
  Number(process.env.SESSION_GRACE_SECONDS ?? 90) * 1_000,
);

/**
 * Stable per-tab session key sent by the browser in the handshake auth.
 * Falls back to `socket.id` for legacy clients / direct connections so the
 * wire protocol stays backward compatible.
 */
export function sessionKey(socket: Socket): string {
  const raw = (socket.handshake.auth as { sessionId?: unknown } | undefined)?.sessionId;
  if (typeof raw === "string" && raw.length > 0 && raw.length <= 128) return raw;
  return socket.id;
}

type TeardownFn = (sid: string) => void | Promise<void>;

/** Handlers register their per-session cleanup here once, at module load. */
const teardownFns = new Set<TeardownFn>();
export function onSessionTeardown(fn: TeardownFn): void {
  teardownFns.add(fn);
}

/** sid → set of currently-connected socket.ids for that session. */
const liveSockets = new Map<string, Set<string>>();
/** sid → scheduled grace-teardown timer. */
const pending = new Map<string, NodeJS.Timeout>();

function cancelPending(sid: string): void {
  const h = pending.get(sid);
  if (h) {
    clearTimeout(h);
    pending.delete(sid);
  }
}

/** Mark a socket as live for its session and cancel any pending teardown. */
export function registerLiveSocket(sid: string, socketId: string): void {
  let set = liveSockets.get(sid);
  if (!set) {
    set = new Set();
    liveSockets.set(sid, set);
  }
  set.add(socketId);
  cancelPending(sid); // reconnected within grace — keep the session alive
}

function runTeardown(sid: string): void {
  pending.delete(sid);
  if (liveSockets.get(sid)?.size) return; // reconnected in the meantime
  for (const fn of teardownFns) {
    try {
      void fn(sid);
    } catch {
      // teardown must never throw
    }
  }
}

/**
 * Release a socket from its session. When the last socket for a session goes
 * away, schedule teardown after the grace window (unless the session
 * reconnects first).
 */
export function releaseLiveSocket(sid: string, socketId: string): void {
  const set = liveSockets.get(sid);
  if (set) {
    set.delete(socketId);
    if (set.size > 0) return; // another socket for this session is still alive
    liveSockets.delete(sid);
  }
  cancelPending(sid);
  if (SESSION_GRACE_MS <= 0) {
    runTeardown(sid);
    return;
  }
  const h = setTimeout(() => runTeardown(sid), SESSION_GRACE_MS);
  h.unref?.();
  pending.set(sid, h);
}
