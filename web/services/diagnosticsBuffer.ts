/**
 * Browser-side ring buffer of Socket.IO events for the Diagnostics panel.
 *
 * Keeps the most recent N events (default 200). Each entry records direction
 * (`in`/`out`), event name, payload preview, and a wall-clock timestamp.
 * Mounted from the Page component so it captures events for every tab.
 */

export type Direction = "in" | "out";

export interface DiagnosticsEntry {
  id: number;
  ts: number; // ms since epoch
  direction: Direction;
  event: string;
  payloadPreview: string; // truncated JSON string
}

const MAX_ENTRIES = 200;

/**
 * Socket.IO transport/session plumbing between the browser and the Next.js
 * server — NOT part of the widget protocol. The Diagnostics panel exists to
 * trace widget configure/auth/connect/message behaviour, so these are dropped
 * to keep it focused on widget-related events only.
 */
const NON_WIDGET_EVENTS = new Set([
  "connect",
  "disconnect",
  "connect_error",
  "connected_to_server",
]);

/** True for events that represent interaction with the Octonomy widget. */
export function isWidgetEvent(event: string): boolean {
  return !NON_WIDGET_EVENTS.has(event);
}

let counter = 0;
const buffer: DiagnosticsEntry[] = [];
const listeners = new Set<(snapshot: DiagnosticsEntry[]) => void>();

function notify(): void {
  const snapshot = buffer.slice();
  for (const l of listeners) {
    try {
      l(snapshot);
    } catch (err) {
      console.warn("[diagnosticsBuffer] listener threw:", err);
    }
  }
}

function preview(args: unknown[]): string {
  try {
    const single = args.length === 1 ? args[0] : args;
    const str = JSON.stringify(single);
    if (!str) return "";
    return str.length > 600 ? `${str.slice(0, 600)}…` : str;
  } catch {
    return String(args);
  }
}

export const DiagnosticsBuffer = {
  record(direction: Direction, event: string, args: unknown[]): void {
    // Only widget-related events belong in the panel — skip transport noise.
    if (!isWidgetEvent(event)) return;
    const entry: DiagnosticsEntry = {
      id: ++counter,
      ts: Date.now(),
      direction,
      event,
      payloadPreview: preview(args),
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    notify();
  },
  clear(): void {
    buffer.length = 0;
    notify();
  },
  snapshot(): DiagnosticsEntry[] {
    return buffer.slice();
  },
  subscribe(listener: (s: DiagnosticsEntry[]) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
