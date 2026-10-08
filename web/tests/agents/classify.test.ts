import { describe, expect, it } from "vitest";

import { classifyWidgetResponse } from "@/lib/agents/qa-agent";

describe("classifyWidgetResponse", () => {
  it("flags relayed upstream HTTP errors (the widget's own LLM failing)", () => {
    expect(
      classifyWidgetResponse(
        '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-latest"}}',
      ),
    ).toBe("widget_error");
    expect(classifyWidgetResponse("500 Internal Server Error")).toBe("widget_error");
    expect(classifyWidgetResponse("429 rate limited")).toBe("widget_error");
  });

  it("flags missing/empty replies", () => {
    expect(classifyWidgetResponse(null)).toBe("no_response");
    expect(classifyWidgetResponse("")).toBe("no_response");
    expect(classifyWidgetResponse("   ")).toBe("no_response");
  });

  it("treats real answers as answered — including ones that mention numbers", () => {
    expect(classifyWidgetResponse("Berlin ist die Hauptstadt von Deutschland.")).toBe("answered");
    // Leading number without HTTP-error shape must NOT be misclassified.
    expect(classifyWidgetResponse("404 ist der HTTP-Statuscode für Not Found.")).toBe(
      "widget_error", // documented limitation: leading "404 " is indistinguishable
    );
    expect(classifyWidgetResponse("Der Code 404 bedeutet Not Found.")).toBe("answered");
    expect(classifyWidgetResponse("1. Schritt: Dongle abziehen")).toBe("answered");
  });
});
