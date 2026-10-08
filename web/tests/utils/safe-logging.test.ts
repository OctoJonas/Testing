import { describe, expect, it } from "vitest";
import { fingerprint, hasToken } from "@/lib/utils/safe-logging";

describe("fingerprint", () => {
  it("returns 'none' for empty input", () => {
    expect(fingerprint("")).toBe("none");
    expect(fingerprint(null)).toBe("none");
    expect(fingerprint(undefined)).toBe("none");
  });

  it("is deterministic for the same input", () => {
    expect(fingerprint("secret-token")).toBe(fingerprint("secret-token"));
  });

  it("differs across distinct inputs", () => {
    expect(fingerprint("token-a")).not.toBe(fingerprint("token-b"));
  });

  it("is short (8 hex chars by default)", () => {
    const fp = fingerprint("anything");
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("hasToken", () => {
  it("returns 'no' for missing tokens", () => {
    expect(hasToken("")).toBe("no");
  });
  it("returns 'yes (fp=...)' for present tokens", () => {
    expect(hasToken("abc")).toMatch(/^yes \(fp=[0-9a-f]{8}\)$/);
  });
});
