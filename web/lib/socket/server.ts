/**
 * Socket.IO event registry. Each connection gets chat + qa + autonomous
 * handlers. The connection pool sweeper is started by server.ts at boot.
 */
import type { Server } from "socket.io";

import { connectionPool } from "../connection-pool";
import * as rateLimit from "../utils/rate-limit";
import { registerAutonomousHandlers } from "./handlers-autonomous";
import { registerChatHandlers } from "./handlers-chat";
import { registerQAHandlers } from "./handlers-qa";
import {
  onSessionTeardown,
  registerLiveSocket,
  releaseLiveSocket,
  sessionKey,
} from "./session";

// Connection pool + rate-limit buckets are torn down once a session has been
// gone past the grace window (see ./session). Registered once at module load.
onSessionTeardown(async (sid) => {
  await connectionPool.disconnectSession(sid).catch(() => undefined);
  rateLimit.qaTestStarts.reset(sid);
  rateLimit.sendMessage.reset(sid);
  rateLimit.generic.reset(sid);
});

// Per-event tracing of every Socket.IO payload. This monkey-patches
// `socket.emit` and logs message/widget content to stdout, so it must NOT run
// in production by default (CPU overhead + leaks payloads past safe-logging).
// Default: on in dev, off in prod. Override explicitly with SOCKET_DEBUG.
const DEBUG_EVENTS =
  process.env.SOCKET_DEBUG !== undefined
    ? process.env.SOCKET_DEBUG === "true"
    : process.env.NODE_ENV !== "production";

export function registerHandlers(io: Server): void {
  io.on("connection", (socket) => {
    // Stable per-tab id from the handshake (falls back to socket.id). All
    // per-session server state is keyed by this, NOT the ephemeral socket.id.
    const sid = sessionKey(socket);
    // Join a room named after the session so `io.to(sid).emit(...)` reaches
    // whichever socket currently backs the session, even after a reconnect.
    socket.join(sid);
    registerLiveSocket(sid, socket.id);
    console.log(`[socket] client connected: ${socket.id} (session ${sid})`);

    // Diagnostic: log every event the browser sends, so production-style
    // "stuck on Configuring" symptoms can be traced from the server side.
    // Disable with SOCKET_DEBUG=false.
    if (DEBUG_EVENTS) {
      socket.onAny((event, ...args) => {
        const summary = args
          .map((a) => {
            if (typeof a === "string") return JSON.stringify(a.slice(0, 80));
            try {
              return JSON.stringify(a).slice(0, 200);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        console.log(`[socket] ${socket.id} ← ${event}  ${summary}`);
      });
      // Also log every server → client emit from this socket so we can see
      // the full bidirectional sequence.
      const origEmit = socket.emit.bind(socket);
      socket.emit = ((event: string, ...args: unknown[]) => {
        const summary = args
          .map((a) => {
            try {
              return JSON.stringify(a).slice(0, 200);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        console.log(`[socket] ${socket.id} → ${event}  ${summary}`);
        return origEmit(event, ...args);
      }) as typeof socket.emit;
    }

    registerChatHandlers(io, socket);
    registerQAHandlers(io, socket);
    registerAutonomousHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
      // Don't tear the session down immediately — a transient drop must not
      // wipe config / in-flight runs. Teardown fires only if the session
      // doesn't reconnect within the grace window (see ./session).
      releaseLiveSocket(sid, socket.id);
    });
  });
}
