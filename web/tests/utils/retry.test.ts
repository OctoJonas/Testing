import { describe, expect, it } from "vitest";
import { retry, defaultIsRetryable } from "@/lib/utils/retry";

describe("retry", () => {
  it("returns the result on first success", async () => {
    let calls = 0;
    const result = await retry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries retryable errors", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 503, message: "boom" };
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 5, jitter: 0, isRetryable: defaultIsRetryable },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw { status: 401 };
        },
        { baseDelayMs: 1, jitter: 0, isRetryable: defaultIsRetryable },
      ),
    ).rejects.toBeTruthy();
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw { status: 502 };
        },
        { maxAttempts: 4, baseDelayMs: 1, jitter: 0, isRetryable: defaultIsRetryable },
      ),
    ).rejects.toBeTruthy();
    expect(calls).toBe(4);
  });
});

describe("defaultIsRetryable", () => {
  it("retries on retryable HTTP statuses", () => {
    expect(defaultIsRetryable({ status: 429 })).toBe(true);
    expect(defaultIsRetryable({ status: 503 })).toBe(true);
  });

  it("does not retry on terminal HTTP statuses", () => {
    expect(defaultIsRetryable({ status: 400 })).toBe(false);
    expect(defaultIsRetryable({ status: 404 })).toBe(false);
  });

  it("retries on Node connection errors", () => {
    expect(defaultIsRetryable({ code: "ECONNRESET" })).toBe(true);
    expect(defaultIsRetryable({ code: "ETIMEDOUT" })).toBe(true);
  });
});
