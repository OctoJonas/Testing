/**
 * Process-wide connection-status store for the three tab contexts.
 *
 * Each socket hook reports its current state into this store; the
 * TabNavigation reads it via `useConnectionStatuses` to render coloured
 * dots. Single source of truth so a tab can be confident the dot reflects
 * the same lifecycle the tab itself observed.
 */

export type ConnectionState =
  | "idle"
  | "configuring"
  | "authenticating"
  | "connecting"
  | "connected"
  | "error";

export type ContextKey = "chat" | "qa_test" | "autonomous";

export type StatusMap = Record<ContextKey, ConnectionState>;

const initialStatus: StatusMap = {
  chat: "idle",
  qa_test: "idle",
  autonomous: "idle",
};

let current: StatusMap = { ...initialStatus };
const listeners = new Set<(s: StatusMap) => void>();

// States that should resolve quickly. If one of these persists past
// STUCK_TIMEOUT_MS (e.g. the server never ACKs a configure), flip to "error"
// rather than leaving a dot spinning on "Configuring…" forever.
const TRANSITIONAL: ReadonlySet<ConnectionState> = new Set([
  "configuring",
  "authenticating",
  "connecting",
]);
const STUCK_TIMEOUT_MS = 30_000;
const stuckTimers: Partial<Record<ContextKey, ReturnType<typeof setTimeout>>> = {};

function notify(): void {
  for (const l of listeners) {
    try {
      l(current);
    } catch (err) {
      console.error("[connectionStatusStore] listener threw:", err);
    }
  }
}

export const ConnectionStatusStore = {
  get(): StatusMap {
    return current;
  },
  set(context: ContextKey, state: ConnectionState): void {
    if (current[context] === state) return;
    current = { ...current, [context]: state };

    const existing = stuckTimers[context];
    if (existing) {
      clearTimeout(existing);
      delete stuckTimers[context];
    }
    if (TRANSITIONAL.has(state)) {
      const timer = setTimeout(() => {
        delete stuckTimers[context];
        if (TRANSITIONAL.has(current[context])) {
          current = { ...current, [context]: "error" };
          notify();
        }
      }, STUCK_TIMEOUT_MS);
      (timer as { unref?: () => void }).unref?.();
    }
    notify();
  },
  reset(): void {
    for (const key of Object.keys(stuckTimers) as ContextKey[]) {
      clearTimeout(stuckTimers[key]);
      delete stuckTimers[key];
    }
    current = { ...initialStatus };
    notify();
  },
  subscribe(listener: (s: StatusMap) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
