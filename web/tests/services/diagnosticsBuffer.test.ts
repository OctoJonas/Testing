import { beforeEach, describe, expect, it } from "vitest";

import { DiagnosticsBuffer, isWidgetEvent } from "@/services/diagnosticsBuffer";

describe("isWidgetEvent", () => {
  it("excludes browser↔server transport / session plumbing", () => {
    for (const e of ["connect", "disconnect", "connect_error", "connected_to_server"]) {
      expect(isWidgetEvent(e)).toBe(false);
    }
  });

  it("includes widget-protocol events", () => {
    for (const e of [
      "configure",
      "configured",
      "authenticate",
      "authenticated",
      "chat_connected",
      "send_message",
      "message_chunk",
      "message_complete",
      "qa_test_update",
      "autonomous_turn_update",
    ]) {
      expect(isWidgetEvent(e)).toBe(true);
    }
  });
});

describe("DiagnosticsBuffer.record", () => {
  beforeEach(() => DiagnosticsBuffer.clear());

  it("drops non-widget transport events", () => {
    DiagnosticsBuffer.record("in", "connect", [{ sid: "x" }]);
    DiagnosticsBuffer.record("in", "disconnect", [{ reason: "transport close" }]);
    DiagnosticsBuffer.record("in", "connect_error", [{ message: "boom" }]);
    expect(DiagnosticsBuffer.snapshot()).toHaveLength(0);
  });

  it("keeps widget events in order", () => {
    DiagnosticsBuffer.record("out", "send_message", [{ message: "hi" }]);
    DiagnosticsBuffer.record("in", "message_chunk", [{ chunk: "h" }]);
    expect(DiagnosticsBuffer.snapshot().map((e) => e.event)).toEqual([
      "send_message",
      "message_chunk",
    ]);
  });
});
