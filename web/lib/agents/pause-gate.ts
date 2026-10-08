/**
 * Async pause gate. By default open (workers pass through immediately).
 * Calling `pause()` blocks subsequent `wait()` calls until `resume()` is
 * called. Used by QATestingAgent so test runs can be paused mid-flight
 * without losing partial results.
 */
export class PauseGate {
  private paused = false;
  private resolvers: Array<() => void> = [];

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const waiters = this.resolvers;
    this.resolvers = [];
    for (const resolve of waiters) {
      try {
        resolve();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Resolves immediately if not paused. Otherwise blocks until `resume()`
   * is called or `signal.aborted` becomes true.
   */
  async wait(signal?: AbortSignal): Promise<void> {
    if (!this.paused) return;
    if (signal?.aborted) return;
    return new Promise<void>((resolve) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        resolve();
      };
      const onResume = () => {
        cleanup();
        resolve();
      };
      this.resolvers.push(onResume);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
