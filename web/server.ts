/**
 * Custom Node server hosting Next.js + Socket.IO on the same port.
 *
 * Why a custom server: Socket.IO needs persistent connections that Next.js's
 * default request/response handler can't host. We run both on one Node process
 * so the deploy story stays "one container, one port".
 *
 * Note: Next.js's `output: "standalone"` mode is incompatible with custom
 * servers (it doesn't trace server.ts). Production deploys run this file
 * directly via `node --experimental-strip-types server.ts`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

import { registerHandlers } from "./lib/socket/server";
import { startSweeper } from "./lib/connection-pool";
// Side-effect: registers the OctonomyAIClient factory with the pool.
import "./lib/octonomy/factory";
import {
  SESSION_COOKIE,
  authEnabled,
  getCookieValue,
  verifySessionCookie,
} from "./lib/auth/pin";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";

const corsOrigin = (process.env.CORS_ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!dev && corsOrigin.includes("*")) {
  // Same guard the old config.py shipped: refuse to start with a wildcard
  // CORS list in production, since the Socket.IO server respects it.
  console.error(
    "[server] CORS_ALLOWED_ORIGINS=* is not allowed in production. " +
      "Set an explicit comma-separated list of origins.",
  );
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req, res).catch((err: unknown) => {
      console.error("[server] request handler failed", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin.length ? corsOrigin : "*",
      credentials: true,
    },
    transports: ["polling", "websocket"],
  });

  // Reject Socket.IO handshakes that don't carry a valid session cookie when
  // the PIN gate is enabled. The cookie travels with the upgrade request.
  if (authEnabled()) {
    io.use(async (socket, next_) => {
      const cookieHeader = socket.handshake.headers.cookie;
      const token = getCookieValue(cookieHeader, SESSION_COOKIE);
      if (await verifySessionCookie(token)) return next_();
      next_(new Error("auth required"));
    });
    console.log("[server] PIN gate enabled (APP_PIN set)");
  } else {
    console.log("[server] PIN gate disabled (APP_PIN unset)");
  }

  registerHandlers(io);
  startSweeper();

  httpServer.listen(port, hostname, () => {
    console.log(
      `[server] ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`,
    );
    console.log(`[server] CORS origins: ${JSON.stringify(corsOrigin.length ? corsOrigin : ["*"])}`);
  });
});
