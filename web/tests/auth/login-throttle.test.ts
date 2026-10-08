import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_FAILURES,
  checkLogin,
  recordFailure,
  recordSuccess,
  resetThrottle,
} from "@/lib/auth/login-throttle";

const T0 = 1_000_000;

beforeEach(() => resetThrottle());

describe("login throttle", () => {
  it("allows fresh clients", () => {
    expect(checkLogin("ip1", T0)).toMatchObject({ locked: false, failures: 0 });
  });

  it("locks after MAX_FAILURES failures in the window", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      expect(recordFailure("ip1", T0 + i * 1000).locked).toBe(false);
    }
    const final = recordFailure("ip1", T0 + 5_000);
    expect(final.locked).toBe(true);
    expect(final.retryAfterSec).toBeGreaterThan(0);
    expect(checkLogin("ip1", T0 + 6_000).locked).toBe(true);
  });

  it("unlocks after the lock period expires", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("ip1", T0);
    expect(checkLogin("ip1", T0 + 14 * 60_000).locked).toBe(true);
    expect(checkLogin("ip1", T0 + 16 * 60_000).locked).toBe(false);
  });

  it("expires stale failure windows", () => {
    recordFailure("ip1", T0);
    recordFailure("ip1", T0);
    // 11 minutes later the window restarted — failures don't accumulate.
    expect(checkLogin("ip1", T0 + 11 * 60_000).failures).toBe(0);
  });

  it("success clears the counter", () => {
    recordFailure("ip1", T0);
    recordFailure("ip1", T0);
    recordSuccess("ip1");
    expect(checkLogin("ip1", T0 + 1).failures).toBe(0);
  });

  it("throttles per client key", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("ip1", T0);
    expect(checkLogin("ip1", T0 + 1).locked).toBe(true);
    expect(checkLogin("ip2", T0 + 1).locked).toBe(false);
  });
});
