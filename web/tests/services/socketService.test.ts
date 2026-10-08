import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@/lib/types";

// Hoisted so the vi.mock factory can reference the fake socket before imports.
const { fakeSocket, handlers, rawEmit } = vi.hoisted(() => {
  const handlers = new Map<string, (...a: unknown[]) => void>();
  const rawEmit = vi.fn();
  const fakeSocket = {
    id: "sock-1",
    connected: false,
    on: (event: string, cb: (...a: unknown[]) => void) => {
      handlers.set(event, cb);
    },
    onAny: () => {},
    emit: rawEmit as (...a: unknown[]) => void,
    disconnect: () => {},
  };
  return { fakeSocket, handlers, rawEmit };
});

vi.mock("socket.io-client", () => ({ io: () => fakeSocket }));

// Imported after the mock is registered.
const { socketService } = await import("@/services/socketService");

const cfg: Config = {
  name: "c",
  widgetId: "w",
  baseUrl: "https://x",
  origin: "https://o",
  referer: "https://r",
} as unknown as Config;

const fireConnect = () => handlers.get("connect")!();
const configureContexts = () =>
  rawEmit.mock.calls
    .filter((c) => c[0] === "configure")
    .map((c) => (c[1] as { _context?: string })._context);

beforeEach(() => {
  handlers.clear();
  rawEmit.mockClear();
  fakeSocket.connected = false;
  fakeSocket.emit = rawEmit as (...a: unknown[]) => void;
});

afterEach(() => {
  socketService.disconnect();
});

describe("socketService reconnect replay", () => {
  it("does not replay configure on the first connect", () => {
    socketService.connect();
    socketService.configure(cfg, "chat");
    const before = configureContexts().length;
    fireConnect(); // first connect
    expect(configureContexts().length).toBe(before);
  });

  it("replays every stored context's configure on reconnect", () => {
    socketService.connect();
    socketService.configure(cfg, "chat");
    socketService.configure(cfg, "qa_test");
    fireConnect(); // first connect — marks hasConnectedOnce
    rawEmit.mockClear();
    fireConnect(); // reconnect — should replay
    const ctxs = configureContexts();
    expect(ctxs).toContain("chat");
    expect(ctxs).toContain("qa_test");
  });

  it("does not replay a chat context the user explicitly disconnected", () => {
    socketService.connect();
    socketService.configure(cfg, "chat");
    fireConnect();
    socketService.disconnectChat("chat");
    rawEmit.mockClear();
    fireConnect(); // reconnect
    expect(configureContexts()).not.toContain("chat");
  });
});
