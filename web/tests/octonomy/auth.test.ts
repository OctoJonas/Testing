import { describe, expect, it } from "vitest";
import { CookieJar } from "tough-cookie";
import { AuthenticationManager } from "@/lib/octonomy/auth";
import { ClientConfig } from "@/lib/octonomy/config";

describe("AuthenticationManager.decodeWidgetId", () => {
  it("decodes a valid base64 widget id", () => {
    const widget = "widget-tenant-123";
    const encoded = Buffer.from(widget, "utf-8").toString("base64");
    const config = new ClientConfig({
      widgetId: encoded,
      baseUrl: "https://t.octonomy.ai",
      origin: "https://x.com",
      referer: "https://x.com/",
    });
    const auth = new AuthenticationManager(config, new CookieJar());
    expect(auth.decodeWidgetId()).toBe(widget);
  });

  it("rejects the placeholder widget id with a clear message", () => {
    const config = new ClientConfig({
      widgetId: "your-widget-id-here",
      baseUrl: "https://t.octonomy.ai",
      origin: "https://x.com",
      referer: "https://x.com/",
    });
    const auth = new AuthenticationManager(config, new CookieJar());
    expect(() => auth.decodeWidgetId()).toThrow(
      /Widget ID is not valid base64|won't work/,
    );
  });
});

describe("ClientConfig", () => {
  it("derives the wss URL", () => {
    const cfg = new ClientConfig({
      widgetId: "x",
      baseUrl: "https://tenant.poc.octonomy.ai",
      origin: "https://o.com",
      referer: "https://o.com/",
    });
    expect(cfg.getSocketUrl()).toBe("https://tenant.poc.wss.octonomy.ai");
    expect(cfg.getTenant()).toBe("tenant");
  });
});
