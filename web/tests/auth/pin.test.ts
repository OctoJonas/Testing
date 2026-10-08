import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authEnabled,
  getCookieValue,
  pinFromEnv,
  sessionTokenFor,
  verifySessionCookie,
} from "@/lib/auth/pin";

const ORIGINAL_PIN = process.env.APP_PIN;

afterEach(() => {
  if (ORIGINAL_PIN === undefined) delete process.env.APP_PIN;
  else process.env.APP_PIN = ORIGINAL_PIN;
});

describe("pinFromEnv", () => {
  it("returns the env value when set", () => {
    process.env.APP_PIN = "9999";
    expect(pinFromEnv()).toBe("9999");
  });

  it("falls back to the hardcoded default when unset", () => {
    delete process.env.APP_PIN;
    expect(pinFromEnv()).toBe("3400");
  });

  it("falls back when explicitly empty", () => {
    process.env.APP_PIN = "   ";
    expect(pinFromEnv()).toBe("3400");
  });

  it("trims whitespace", () => {
    process.env.APP_PIN = "  4242  ";
    expect(pinFromEnv()).toBe("4242");
  });
});

describe("authEnabled", () => {
  it("is always on with the hardcoded default", () => {
    delete process.env.APP_PIN;
    expect(authEnabled()).toBe(true);
  });
});

describe("sessionTokenFor", () => {
  it("is deterministic for the same PIN", async () => {
    const a = await sessionTokenFor("3400");
    const b = await sessionTokenFor("3400");
    expect(a).toBe(b);
  });

  it("differs across distinct PINs", async () => {
    const a = await sessionTokenFor("3400");
    const b = await sessionTokenFor("9999");
    expect(a).not.toBe(b);
  });

  it("returns base64url (no '+' / '/' / '=')", async () => {
    const t = await sessionTokenFor("3400");
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("verifySessionCookie", () => {
  beforeEach(() => {
    process.env.APP_PIN = "3400";
  });

  it("rejects null/empty/undefined cookies", async () => {
    expect(await verifySessionCookie(null)).toBe(false);
    expect(await verifySessionCookie(undefined)).toBe(false);
    expect(await verifySessionCookie("")).toBe(false);
  });

  it("rejects garbage cookies", async () => {
    expect(await verifySessionCookie("not-a-real-token")).toBe(false);
  });

  it("accepts the canonical token for the active PIN", async () => {
    const token = await sessionTokenFor("3400");
    expect(await verifySessionCookie(token)).toBe(true);
  });

  it("rejects a token signed with a different PIN", async () => {
    const token = await sessionTokenFor("9999");
    process.env.APP_PIN = "3400";
    expect(await verifySessionCookie(token)).toBe(false);
  });
});

describe("getCookieValue", () => {
  it("extracts a single named value", () => {
    expect(getCookieValue("octonomy_session=abc; foo=bar", "octonomy_session")).toBe("abc");
  });

  it("returns null when missing", () => {
    expect(getCookieValue("foo=bar", "octonomy_session")).toBeNull();
    expect(getCookieValue(undefined, "octonomy_session")).toBeNull();
  });

  it("handles values containing equals signs", () => {
    expect(getCookieValue("octonomy_session=a=b=c", "octonomy_session")).toBe("a=b=c");
  });

  it("ignores leading whitespace per cookie part", () => {
    expect(getCookieValue("foo=1;   octonomy_session=abc", "octonomy_session")).toBe("abc");
  });
});
