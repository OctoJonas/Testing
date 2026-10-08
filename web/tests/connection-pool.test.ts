import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionPool } from "@/lib/connection-pool";
import type { ClientConfigInit, OctonomyClientLike } from "@/lib/octonomy/types";

class FakeClient implements OctonomyClientLike {
  conversationManager = { conversationId: "conv-1" };
  connected = false;
  authenticated = false;
  authCalls = 0;
  connectCalls = 0;
  disconnectCalls = 0;

  constructor(public readonly config: ClientConfigInit) {}

  async authenticate(): Promise<boolean> {
    this.authCalls++;
    this.authenticated = true;
    return true;
  }
  async connect(): Promise<boolean> {
    this.connectCalls++;
    this.connected = true;
    return true;
  }
  isConnected(): boolean {
    return this.connected;
  }
  async disconnect(): Promise<void> {
    this.disconnectCalls++;
    this.connected = false;
  }
  async sendMessage(): Promise<string | null> {
    return "ok";
  }
}

describe("ConnectionPoolManager", () => {
  beforeEach(() => {
    // Inject our fake client factory.
    connectionPool.setFactory((cfg) => new FakeClient(cfg));
  });

  afterEach(async () => {
    // Tear down whatever each test created.
    for (const sid of ["sid-1", "sid-2", "sid-stale"]) {
      await connectionPool.disconnectSession(sid).catch(() => undefined);
    }
  });

  it("requires setConfig before getClient", async () => {
    await expect(connectionPool.getClient("sid-1", "chat", { autoCreate: true })).rejects.toThrow(
      /No configuration found/,
    );
  });

  it("reuses the existing client for the same context", async () => {
    connectionPool.setConfig("sid-1", makeConfig(), "chat");
    const a = (await connectionPool.getClient("sid-1", "chat", { autoCreate: true })) as FakeClient;
    const b = (await connectionPool.getClient("sid-1", "chat", { autoCreate: true })) as FakeClient;
    expect(a).toBe(b);
  });

  it("auto-connect calls authenticate + connect once", async () => {
    connectionPool.setConfig("sid-1", makeConfig(), "chat");
    const c = (await connectionPool.getClient("sid-1", "chat", {
      autoCreate: true,
      autoConnect: true,
    })) as FakeClient;
    expect(c.authCalls).toBe(1);
    expect(c.connectCalls).toBe(1);
    expect(c.connected).toBe(true);
  });

  it("deduplicates concurrent auto-connect calls", async () => {
    connectionPool.setConfig("sid-1", makeConfig(), "chat");
    const [a, b] = (await Promise.all([
      connectionPool.getClient("sid-1", "chat", { autoCreate: true, autoConnect: true }),
      connectionPool.getClient("sid-1", "chat", { autoCreate: true, autoConnect: true }),
    ])) as FakeClient[];
    expect(a).toBe(b);
    expect(a.authCalls).toBe(1);
    expect(a.connectCalls).toBe(1);
  });

  it("disconnect_context drops the entry and calls disconnect()", async () => {
    connectionPool.setConfig("sid-1", makeConfig(), "chat");
    const c = (await connectionPool.getClient("sid-1", "chat", { autoCreate: true })) as FakeClient;
    expect(connectionPool.isConnected("sid-1", "chat")).toBe(false);
    await c.connect();
    expect(connectionPool.isConnected("sid-1", "chat")).toBe(true);
    expect(await connectionPool.disconnectContext("sid-1", "chat")).toBe(true);
    expect(c.disconnectCalls).toBe(1);
    expect(connectionPool.isConnected("sid-1", "chat")).toBe(false);
  });

  it("falls back from derived contexts to the base config", async () => {
    connectionPool.setConfig("sid-2", makeConfig(), "qa_test");
    const c = (await connectionPool.getClient("sid-2", "qa_test_w0", { autoCreate: true })) as FakeClient;
    expect(c).toBeTruthy();
    expect(c.config.widgetId).toBe("widget-id-base64");
  });

  it("sweep evicts stale sessions", async () => {
    connectionPool.setConfig("sid-stale", makeConfig(), "chat");
    await connectionPool.getClient("sid-stale", "chat", { autoCreate: true });
    expect(connectionPool.getSessionStats("sid-stale").totalContexts).toBe(1);
    // Force a "very long ago" lastSeen by spying on performance.now.
    const real = performance.now;
    vi.spyOn(performance, "now").mockReturnValue(real.call(performance) + 1_000_000_000);
    const evicted = await connectionPool.sweepIdleSessions(60); // 60s ttl
    expect(evicted).toBeGreaterThanOrEqual(1);
    expect(connectionPool.getSessionStats("sid-stale").totalContexts).toBe(0);
    vi.restoreAllMocks();
  });
});

function makeConfig(): ClientConfigInit {
  return {
    widgetId: "widget-id-base64",
    baseUrl: "https://example.octonomy.ai",
    origin: "https://example.com",
    referer: "https://example.com/",
  };
}
