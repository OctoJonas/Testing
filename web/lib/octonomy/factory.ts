/**
 * Wires the OctonomyAIClient implementation into the connection pool.
 *
 * Side-effect: imported once from server.ts at startup so the factory
 * registration runs before any handler tries to instantiate a client.
 */
import { connectionPool } from "../connection-pool";
import { OctonomyAIClient } from "./client";

const isDev = process.env.NODE_ENV !== "production";

connectionPool.setFactory(
  (cfg) =>
    new OctonomyAIClient({
      ...cfg,
      // Verbose SDK logging is on in dev so the server log shows every step
      // of the auth → conversation → WebSocket handshake. Override per-config
      // if you want to silence it.
      verboseLogging: cfg.verboseLogging ?? isDev,
    }),
);
