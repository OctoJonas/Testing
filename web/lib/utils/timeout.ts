/**
 * Timeout + abortable-sleep helpers.
 *
 * Long test runs call out to the widget (Socket.IO) and to Anthropic/OpenAI.
 * Without an upper bound a single stalled call pins a worker for the SDK's
 * default timeout (~10 min) or the widget's response timeout, starving the
 * rest of the run. `withTimeout` puts a hard ceiling on any single await, and
 * `abortableSleep` lets inter-turn delays be cut short the instant a run is
 * stopped instead of blocking for the full delay.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Reject with a {@link TimeoutError} if `promise` hasn't settled within `ms`.
 * A non-positive `ms` disables the timeout and returns the promise as-is.
 * Note: the underlying work is not cancelled — this only stops *waiting* for
 * it — so callers should also release/reset whatever resource it held.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  if (!ms || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
    (timer as NodeJS.Timeout).unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Sleep `ms`, resolving early (not rejecting) if `signal` aborts first. Used
 * for inter-turn pacing so stopping a run doesn't wait out the full delay.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    (timer as NodeJS.Timeout).unref?.();
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
