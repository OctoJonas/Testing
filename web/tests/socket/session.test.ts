import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io";

import {
  onSessionTeardown,
  registerLiveSocket,
  releaseLiveSocket,
  sessionKey,
} from "@/lib/socket/session";

// Default grace window (SESSION_GRACE_SECONDS unset) is 90s.
const GRACE_MS = 90_000;

// One recorder for the whole file; assertions filter by the unique sid each
// test uses, so the shared teardown registry doesn't cause cross-talk.
const tornDown: string[] = [];
onSessionTeardown((sid) => {
  tornDown.push(sid);
});

function fakeSocket(id: string, sessionId?: string): Socket {
  return {
    id,
    handshake: { auth: sessionId === undefined ? {} : { sessionId } },
  } as unknown as Socket;
}

describe("sessionKey", () => {
  it("uses the handshake auth.sessionId when present", () => {
    expect(sessionKey(fakeSocket("sock1", "tab-abc"))).toBe("tab-abc");
  });

  it("falls back to socket.id when no sessionId is provided", () => {
    expect(sessionKey(fakeSocket("sock1"))).toBe("sock1");
  });

  it("rejects an absurdly long sessionId and falls back to socket.id", () => {
    expect(sessionKey(fakeSocket("sock1", "x".repeat(200)))).toBe("sock1");
  });
});

describe("grace teardown", () => {
  beforeEach(() => {
    tornDown.length = 0;
    vi.useFakeTimers();
  });

  it("does not tear down before the grace window elapses", () => {
    const sid = "s-before";
    registerLiveSocket(sid, "sock-1");
    releaseLiveSocket(sid, "sock-1");
    vi.advanceTimersByTime(GRACE_MS - 1_000);
    expect(tornDown).not.toContain(sid);
    vi.useRealTimers();
  });

  it("tears down after the grace window elapses", () => {
    const sid = "s-after";
    registerLiveSocket(sid, "sock-1");
    releaseLiveSocket(sid, "sock-1");
    vi.advanceTimersByTime(GRACE_MS);
    expect(tornDown).toContain(sid);
    vi.useRealTimers();
  });

  it("cancels teardown when the session reconnects within grace (new socket.id)", () => {
    const sid = "s-reconnect";
    registerLiveSocket(sid, "sock-old");
    releaseLiveSocket(sid, "sock-old");
    vi.advanceTimersByTime(GRACE_MS / 2);
    registerLiveSocket(sid, "sock-new"); // reconnect: same session, new socket.id
    vi.advanceTimersByTime(GRACE_MS);
    expect(tornDown).not.toContain(sid);
    vi.useRealTimers();
  });

  it("stays alive while another socket for the session remains", () => {
    const sid = "s-multi";
    registerLiveSocket(sid, "sock-a");
    registerLiveSocket(sid, "sock-b");
    releaseLiveSocket(sid, "sock-a");
    vi.advanceTimersByTime(GRACE_MS);
    expect(tornDown).not.toContain(sid); // sock-b still alive
    releaseLiveSocket(sid, "sock-b");
    vi.advanceTimersByTime(GRACE_MS);
    expect(tornDown).toContain(sid);
    vi.useRealTimers();
  });
});
