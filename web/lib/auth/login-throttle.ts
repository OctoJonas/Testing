/**
 * Per-client login attempt throttle. In-memory is correct here: the app runs
 * exactly one machine (in-process state by design), and a restart resetting
 * counters is acceptable for a soft gate.
 *
 * Policy: 5 failures within a 10-minute window → locked for 15 minutes.
 * Success clears the counter.
 */

const WINDOW_MS = 10 * 60_000;
const LOCK_MS = 15 * 60_000;
export const MAX_FAILURES = 5;

interface AttemptState {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptState>();

export interface ThrottleStatus {
  locked: boolean;
  retryAfterSec: number;
  /** Failures recorded in the current window (post-update for recordFailure). */
  failures: number;
}

function getState(key: string, now: number): AttemptState {
  let s = attempts.get(key);
  if (!s) {
    s = { failures: 0, windowStart: now, lockedUntil: 0 };
    attempts.set(key, s);
  }
  // Expired window → start fresh (keeps the map's values bounded too).
  if (now - s.windowStart > WINDOW_MS && now >= s.lockedUntil) {
    s.failures = 0;
    s.windowStart = now;
  }
  return s;
}

export function checkLogin(key: string, now: number = Date.now()): ThrottleStatus {
  const s = getState(key, now);
  if (now < s.lockedUntil) {
    return { locked: true, retryAfterSec: Math.ceil((s.lockedUntil - now) / 1000), failures: s.failures };
  }
  return { locked: false, retryAfterSec: 0, failures: s.failures };
}

export function recordFailure(key: string, now: number = Date.now()): ThrottleStatus {
  const s = getState(key, now);
  s.failures += 1;
  if (s.failures >= MAX_FAILURES) {
    s.lockedUntil = now + LOCK_MS;
    return { locked: true, retryAfterSec: Math.ceil(LOCK_MS / 1000), failures: s.failures };
  }
  return { locked: false, retryAfterSec: 0, failures: s.failures };
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}

/** Test hook. */
export function resetThrottle(): void {
  attempts.clear();
}
