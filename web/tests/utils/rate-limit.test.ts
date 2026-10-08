import { describe, expect, it } from "vitest";
import { TokenBucket } from "@/lib/utils/rate-limit";

describe("TokenBucket", () => {
  it("allows up to capacity then denies", () => {
    const bucket = new TokenBucket(3, 0); // no refill
    expect(bucket.allow("k")).toBe(true);
    expect(bucket.allow("k")).toBe(true);
    expect(bucket.allow("k")).toBe(true);
    expect(bucket.allow("k")).toBe(false);
  });

  it("isolates per-key buckets", () => {
    const bucket = new TokenBucket(1, 0);
    expect(bucket.allow("a")).toBe(true);
    expect(bucket.allow("a")).toBe(false);
    expect(bucket.allow("b")).toBe(true);
  });

  it("reset clears the bucket", () => {
    const bucket = new TokenBucket(1, 0);
    bucket.allow("k");
    expect(bucket.allow("k")).toBe(false);
    bucket.reset("k");
    expect(bucket.allow("k")).toBe(true);
  });

  it("refills tokens over time", async () => {
    const bucket = new TokenBucket(1, 100); // 100/sec
    bucket.allow("k");
    expect(bucket.allow("k")).toBe(false);
    await new Promise((r) => setTimeout(r, 30)); // ~3 tokens
    expect(bucket.allow("k")).toBe(true);
  });
});
