import { describe, expect, it } from "vitest";
import { ConfigurePayload } from "@/lib/schemas/config";
import { SendMessagePayload } from "@/lib/schemas/chat";
import { StartQATestPayload } from "@/lib/schemas/qa";
import { StartAutonomousTestPayload } from "@/lib/schemas/autonomous";

const validConfig = {
  config: {
    widgetId: "abc123",
    baseUrl: "https://example.com",
    origin: "https://other.com",
    referer: "https://other.com/",
  },
  _context: "chat",
};

describe("ConfigurePayload", () => {
  it("accepts a well-formed config", () => {
    expect(() => ConfigurePayload.parse(validConfig)).not.toThrow();
  });

  it("rejects non-http URLs", () => {
    const bad = { ...validConfig, config: { ...validConfig.config, baseUrl: "ftp://x" } };
    expect(() => ConfigurePayload.parse(bad)).toThrow();
  });

  it("rejects empty widgetId", () => {
    const bad = { ...validConfig, config: { ...validConfig.config, widgetId: "" } };
    expect(() => ConfigurePayload.parse(bad)).toThrow();
  });
});

describe("SendMessagePayload", () => {
  it("rejects empty messages", () => {
    expect(() => SendMessagePayload.parse({ message: "" })).toThrow();
  });

  it("rejects oversized messages", () => {
    expect(() => SendMessagePayload.parse({ message: "a".repeat(10_000) })).toThrow();
  });

  it("accepts normal payloads", () => {
    expect(SendMessagePayload.parse({ message: "Hello" }).message).toBe("Hello");
  });
});

describe("StartQATestPayload", () => {
  it("requires at least one Q&A pair", () => {
    expect(() => StartQATestPayload.parse({ qa_pairs: [] })).toThrow();
  });

  it("rejects oversized texts", () => {
    expect(() =>
      StartQATestPayload.parse({
        qa_pairs: [{ Frage: "a".repeat(5_000), Antwort: "b" }],
      }),
    ).toThrow();
  });

  it("accepts optional prompt_config", () => {
    const out = StartQATestPayload.parse({
      qa_pairs: [{ Frage: "Q", Antwort: "A" }],
      prompt_config: { language: "de", satisfactory_threshold: 0.5, use_ragas: false },
    });
    expect(out.prompt_config?.language).toBe("de");
  });
});

describe("StartAutonomousTestPayload", () => {
  it("clamps maxTurns to 1..100", () => {
    expect(() => StartAutonomousTestPayload.parse({ testingPrompt: "p", maxTurns: 0 })).toThrow();
    expect(() => StartAutonomousTestPayload.parse({ testingPrompt: "p", maxTurns: 101 })).toThrow();
  });

  it("defaults enableEvaluation to false", () => {
    const out = StartAutonomousTestPayload.parse({ testingPrompt: "p", maxTurns: 5 });
    expect(out.enableEvaluation).toBe(false);
  });
});
