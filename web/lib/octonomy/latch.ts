/**
 * threading.Event-style one-shot latch for async code.
 *
 * `await latch.wait()` blocks until `set()` is called. `reset()` rearms it.
 * Used by socket-client.ts to await subscription acks and message responses.
 */
export class Latch {
  private latched = false;
  private resolveFn!: () => void;
  promise!: Promise<void>;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.latched = false;
    this.promise = new Promise<void>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  set(): void {
    if (!this.latched) {
      this.latched = true;
      this.resolveFn();
    }
  }

  isSet(): boolean {
    return this.latched;
  }

  /** Wait up to `timeoutMs`. Resolves true if set, false on timeout. */
  async wait(timeoutMs: number): Promise<boolean> {
    if (this.latched) return true;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      const winner = await Promise.race([this.promise.then(() => true as const), timeout]);
      return winner;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
