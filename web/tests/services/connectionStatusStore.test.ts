import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionStatusStore } from "@/services/connectionStatusStore";

describe("ConnectionStatusStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    ConnectionStatusStore.reset();
  });

  it("updates state and notifies subscribers", () => {
    const seen: string[] = [];
    const unsub = ConnectionStatusStore.subscribe((s) => seen.push(s.chat));
    ConnectionStatusStore.set("chat", "configuring");
    expect(ConnectionStatusStore.get().chat).toBe("configuring");
    expect(seen).toContain("configuring");
    unsub();
  });

  it("flips a stuck transitional state to error after the timeout", () => {
    vi.useFakeTimers();
    ConnectionStatusStore.set("chat", "configuring");
    vi.advanceTimersByTime(30_000);
    expect(ConnectionStatusStore.get().chat).toBe("error");
  });

  it("does not flip a transitional state that resolves before the timeout", () => {
    vi.useFakeTimers();
    ConnectionStatusStore.set("qa_test", "configuring");
    ConnectionStatusStore.set("qa_test", "connected");
    vi.advanceTimersByTime(30_000);
    expect(ConnectionStatusStore.get().qa_test).toBe("connected");
  });

  it("does not arm a watchdog for terminal states", () => {
    vi.useFakeTimers();
    ConnectionStatusStore.set("autonomous", "connected");
    vi.advanceTimersByTime(30_000);
    expect(ConnectionStatusStore.get().autonomous).toBe("connected");
  });

  it("reset clears pending watchdogs", () => {
    vi.useFakeTimers();
    ConnectionStatusStore.set("autonomous", "connecting");
    ConnectionStatusStore.reset();
    vi.advanceTimersByTime(30_000);
    expect(ConnectionStatusStore.get().autonomous).toBe("idle");
  });
});
