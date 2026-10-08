/**
 * Per-key token-bucket rate limiter. In-process map; for multi-worker deploys
 * move to Redis. Used by Socket.IO event handlers to bound abusive clients.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucket {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  allow(key: string, cost = 1): boolean {
    const now = performance.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    }
    const elapsedSec = Math.max(0, (now - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    bucket.updatedAt = now;
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }
    return false;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

// Default limiters that mirror the original Python rate_limit.py defaults.
export const qaTestStarts = new TokenBucket(2, 5 / 60); // 5/min, burst 2
export const sendMessage = new TokenBucket(10, 60 / 60); // 60/min, burst 10
export const generic = new TokenBucket(20, 120 / 60); // 120/min, burst 20
