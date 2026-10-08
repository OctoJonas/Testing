/**
 * Exponential-backoff retry with jitter.
 *
 * Mirrors testing/backend/services/utils/retry.py from the Python codebase.
 * Use for HTTP calls (auth, conversation create, etc.) where transient
 * failures should be retried but terminal errors (4xx) fail fast.
 */

export interface RetryOptions {
  /** Total attempts including the first try. */
  maxAttempts?: number;
  /** First retry waits ~baseDelayMs. */
  baseDelayMs?: number;
  /** Cap on per-retry sleep. */
  maxDelayMs?: number;
  /** Multiplicative jitter in [0, 1]. 0.25 → ±25%. */
  jitter?: number;
  /** Decide whether a thrown error is retryable. Default: HTTP 408/429/5xx + network errors. */
  isRetryable?: (err: unknown) => boolean;
}

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function defaultIsRetryable(err: unknown): boolean {
  if (err && typeof err === "object") {
    // fetch Response wrapper shape we use in lib/utils/http.ts
    if ("status" in err && typeof (err as { status: number }).status === "number") {
      return RETRYABLE_HTTP_STATUS.has((err as { status: number }).status);
    }
    // Network errors (DNS, ECONNRESET, ETIMEDOUT, etc.)
    if (err instanceof TypeError) return true;
    if ("code" in err && typeof (err as { code: string }).code === "string") {
      const code = (err as { code: string }).code;
      return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_SOCKET"].includes(code);
    }
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    jitter = 0.25,
    isRetryable = defaultIsRetryable,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const base = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.max(0, base * (1 + (Math.random() * 2 - 1) * jitter));
      console.warn(
        `[retry] attempt ${attempt}/${maxAttempts} failed: ${(err as Error)?.message ?? err}; retrying in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}
