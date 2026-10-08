import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeoutError, abortableSleep, withTimeout } from "@/lib/utils/timeout";

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
  });

  it("rejects with TimeoutError once the deadline passes", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const pending = withTimeout(never, 1_000, "widget");
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("returns the original promise untouched when ms <= 0 (disabled)", () => {
    const original = Promise.resolve("x");
    expect(withTimeout(original, 0)).toBe(original);
  });

  it("propagates the underlying rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });
});

describe("abortableSleep", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves after the full delay when not aborted", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = abortableSleep(1_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await p;
    expect(done).toBe(true);
  });

  it("resolves immediately if the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(abortableSleep(100_000, ac.signal)).resolves.toBeUndefined();
  });

  it("resolves early (does not reject) when aborted mid-sleep", async () => {
    const ac = new AbortController();
    let done = false;
    const p = abortableSleep(100_000, ac.signal).then(() => {
      done = true;
    });
    ac.abort();
    await p;
    expect(done).toBe(true);
  });
});
