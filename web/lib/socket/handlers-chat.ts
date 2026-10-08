/**
 * Chat-tab event handlers — port of socket_handlers.py.
 */
import path from "node:path";

import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";

import {
  ConnectionContext,
  connectionPool,
} from "../connection-pool";
import { ConfigurePayload, ContextOnlyPayload } from "../schemas/config";
import { SendMessagePayload } from "../schemas/chat";
import { atomicWriteJson } from "../utils/atomic-io";
import * as rateLimit from "../utils/rate-limit";
import { onSessionTeardown, sessionKey } from "./session";

const MESSAGE_HISTORY_LIMIT = 1_000;
const exportsDir = path.join(process.cwd(), "exports");

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

const messageHistory = new Map<string, ChatMessage[]>();

/** Per-session aborters for in-flight chat sends. `cancel_chat` calls them. */
const inflightSends = new Map<string, () => void>();

// Cleanup when a session is finally torn down (past the reconnect grace
// window). A transient disconnect no longer runs this, so an in-flight reply
// keeps streaming to the room and resumes on the reconnected socket.
onSessionTeardown((sid) => {
  messageHistory.delete(sid);
  const aborter = inflightSends.get(sid);
  if (aborter) {
    aborter();
    inflightSends.delete(sid);
  }
});

function appendHistory(sid: string, msg: ChatMessage): void {
  let bucket = messageHistory.get(sid);
  if (!bucket) {
    bucket = [];
    messageHistory.set(sid, bucket);
  }
  bucket.push(msg);
  if (bucket.length > MESSAGE_HISTORY_LIMIT) {
    messageHistory.set(sid, bucket.slice(-MESSAGE_HISTORY_LIMIT));
  }
}

function emitValidationError(socket: Socket, event: string, err: unknown): void {
  const message = err instanceof ZodError ? err.issues[0]?.message ?? "Invalid payload" : (err as Error).message;
  socket.emit(event, { error: message });
}

export function registerChatHandlers(io: Server, socket: Socket): void {
  const sid = sessionKey(socket);
  socket.emit("connected_to_server", { status: "connected", session_id: sid });

  socket.on("configure", async (raw) => {
    if (!rateLimit.generic.allow(sid)) {
      socket.emit("configuration_error", { error: "Too many requests; slow down." });
      return;
    }
    let payload: ConfigurePayload;
    try {
      payload = ConfigurePayload.parse(raw);
    } catch (err) {
      emitValidationError(socket, "configuration_error", err);
      return;
    }
    const ctx = payload._context;
    try {
      // Pool clients freeze their config at creation. If this context's
      // config actually changed, evict the old client so the next
      // authenticate/connect builds one against the new widget — otherwise a
      // dropdown switch would keep talking to the previous widget. An
      // identical config (the reconnect replay) is a no-op, so an in-flight
      // session survives transport blips untouched.
      if (ctx) {
        const prev = connectionPool.getConfig(sid, ctx);
        const next = payload.config;
        const changed =
          prev &&
          (prev.widgetId !== next.widgetId ||
            prev.baseUrl !== next.baseUrl ||
            prev.origin !== next.origin ||
            prev.referer !== next.referer);
        if (changed) await connectionPool.disconnectContext(sid, ctx);
      }
      connectionPool.setConfig(sid, payload.config, ctx);
      socket.emit(
        "configured",
        ctx
          ? { message: `Configuration saved for ${ctx}`, context: ctx }
          : { message: "Default configuration saved" },
      );
    } catch (err) {
      socket.emit("configuration_error", { error: (err as Error).message });
    }
  });

  socket.on("authenticate", async (raw) => {
    let payload: ContextOnlyPayload;
    try {
      payload = ContextOnlyPayload.parse(raw ?? {});
    } catch {
      payload = {};
    }
    const ctx = payload._context ?? ConnectionContext.CHAT;
    if (!connectionPool.hasConfig(sid)) {
      socket.emit("error", { error: "Not configured. Please configure first." });
      return;
    }
    try {
      const client = await connectionPool.getClient(sid, ctx, { autoCreate: true });
      if (!client) {
        socket.emit("error", { error: "Failed to create client" });
        return;
      }
      const ok = await client.authenticate();
      if (!ok) {
        socket.emit("authentication_error", {
          error: "Authentication did not yield a token. Check the server log for details.",
          context: ctx,
        });
        return;
      }
      socket.emit("authenticated", { data: true, context: ctx });
    } catch (err) {
      // authenticate() now throws when no token came back, with a clear
      // message (e.g. private/SSO-gated widget). Forward the message so the
      // operator sees it in the chat tab instead of a generic failure.
      socket.emit("authentication_error", { error: (err as Error).message, context: ctx });
    }
  });

  socket.on("connect_chat", async (raw) => {
    let payload: ContextOnlyPayload;
    try {
      payload = ContextOnlyPayload.parse(raw ?? {});
    } catch {
      payload = {};
    }
    const ctx = payload._context ?? ConnectionContext.CHAT;
    if (!connectionPool.hasConfig(sid)) {
      socket.emit("error", { error: "Not configured. Please configure first." });
      return;
    }
    try {
      const client = await connectionPool.getClient(sid, ctx, { autoCreate: true, autoConnect: false });
      if (!client) {
        socket.emit("error", { error: "Failed to create client" });
        return;
      }
      if (!client.isConnected()) {
        const ok = await client.connect();
        if (!ok) {
          socket.emit("error", { error: "Connection failed" });
          return;
        }
      }
      socket.emit("chat_connected", { data: true, context: ctx });
    } catch (err) {
      socket.emit("connection_error", { error: (err as Error).message, context: ctx });
    }
  });

  socket.on("send_message", async (raw) => {
    if (!rateLimit.sendMessage.allow(sid)) {
      socket.emit("error", { error: "Sending too fast; please slow down." });
      return;
    }
    let payload: SendMessagePayload;
    try {
      payload = SendMessagePayload.parse(raw);
    } catch (err) {
      emitValidationError(socket, "error", err);
      return;
    }
    const ctx = payload._context ?? ConnectionContext.CHAT;
    const client = await connectionPool.getClient(sid, ctx, { autoCreate: false });
    if (!client) {
      socket.emit("error", { error: `Not connected in ${ctx} context` });
      return;
    }
    if (!client.isConnected()) {
      socket.emit("error", { error: `${ctx} context not connected` });
      return;
    }

    appendHistory(sid, {
      role: "user",
      content: payload.message,
      timestamp: new Date().toISOString(),
    });

    // Track in-flight send so `cancel_chat` can abort it. We can't cancel the
    // remote Octonomy stream cleanly without disconnecting the socket; the
    // simplest signal is a per-session AbortController that the chunk
    // forwarder checks.
    let aborted = false;
    inflightSends.set(sid, () => {
      aborted = true;
    });

    // Background send so the handler returns immediately. Forward each chunk
    // to the browser as it arrives so the UI streams live instead of waiting
    // for the full reply.
    void (async () => {
      try {
        const reply = await client.sendMessage(payload.message, (chunk) => {
          if (aborted) return;
          io.to(sid).emit("message_chunk", { chunk });
        });
        if (aborted) {
          io.to(sid).emit("message_error", { error: "Cancelled by user" });
          return;
        }
        if (reply) {
          appendHistory(sid, {
            role: "assistant",
            content: reply,
            timestamp: new Date().toISOString(),
          });
          // Carry the authoritative final text. Streaming widgets already built
          // it on the client via message_chunk; non-streaming widgets (single
          // final message, no deltas) send no chunks, so without this the UI
          // would render nothing.
          io.to(sid).emit("message_complete", { reply });
        } else {
          io.to(sid).emit("message_error", { error: "Response timeout — no response received" });
        }
      } catch (err) {
        io.to(sid).emit("message_error", { error: (err as Error).message });
      } finally {
        inflightSends.delete(sid);
      }
    })();
  });

  socket.on("cancel_chat", () => {
    const aborter = inflightSends.get(sid);
    if (aborter) {
      aborter();
      inflightSends.delete(sid);
      socket.emit("chat_cancelled", { message: "Cancel requested" });
    } else {
      socket.emit("chat_cancelled", { message: "No in-flight message to cancel" });
    }
  });

  socket.on("disconnect_chat", async (raw) => {
    let payload: ContextOnlyPayload;
    try {
      payload = ContextOnlyPayload.parse(raw ?? {});
    } catch {
      payload = {};
    }
    const ctx = payload._context ?? ConnectionContext.CHAT;
    try {
      const ok = await connectionPool.disconnectContext(sid, ctx);
      if (ok) socket.emit("disconnected", { message: `Successfully disconnected ${ctx}`, context: ctx });
      else socket.emit("error", { error: `No active ${ctx} context` });
    } catch (err) {
      socket.emit("error", { error: (err as Error).message, context: ctx });
    }
  });

  socket.on("clear_messages", () => {
    messageHistory.set(sid, []);
    socket.emit("messages_cleared", { message: "Message history cleared" });
  });

  socket.on("save_conversation", async (raw) => {
    try {
      const messagesCopy = [...(messageHistory.get(sid) ?? [])];
      const payload = {
        metadata: {
          saved_at: new Date().toISOString(),
          session_id: sid,
          total_messages: messagesCopy.length,
        },
        configuration: (raw as { config?: unknown })?.config ?? {},
        messages: messagesCopy,
        session_status: {
          has_active_session: connectionPool.hasConfig(sid),
          configured: connectionPool.hasConfig(sid),
        },
      };

      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
      const filename = `conversation_${stamp}.json`;
      await atomicWriteJson(path.join(exportsDir, filename), payload);
      socket.emit("conversation_saved", { filename, message: `Conversation saved to ${filename}` });
    } catch (err) {
      socket.emit("save_error", { error: (err as Error).message });
    }
  });

  // Disconnect cleanup is centralised with a grace window (see ./session and
  // the onSessionTeardown above), so a transient drop survives intact.
}
