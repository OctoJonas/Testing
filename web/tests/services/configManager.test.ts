import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigManager,
  mergeConfigs,
  resetConfigCacheForTests,
} from "@/services/configManager";
import type { Config } from "@/lib/types";

/** Minimal in-memory localStorage so the manager runs outside a browser. */
class FakeStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

const sample = (name: string): Config =>
  ({
    name,
    widgetId: "w",
    baseUrl: "https://x",
    origin: "https://o",
    referer: "https://r",
  }) as unknown as Config;

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = new FakeStorage();
  resetConfigCacheForTests();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("ConfigManager", () => {
  it("saves and lists configs", () => {
    ConfigManager.saveConfig(sample("a"));
    expect(ConfigManager.getConfigs().map((c) => c.name)).toEqual(["a"]);
  });

  it("notifies subscribers on create — this is what refreshes the tab dropdowns", () => {
    const seen: string[][] = [];
    const unsub = ConfigManager.subscribe((cfgs) => seen.push(cfgs.map((c) => c.name)));
    ConfigManager.saveConfig(sample("a"));
    ConfigManager.saveConfig(sample("b"));
    unsub();
    ConfigManager.saveConfig(sample("c")); // no longer observed
    expect(seen).toEqual([["a"], ["a", "b"]]);
  });

  it("updates an existing config in place rather than duplicating", () => {
    ConfigManager.saveConfig(sample("a"));
    ConfigManager.saveConfig({ ...sample("a"), baseUrl: "https://new" } as unknown as Config);
    const list = ConfigManager.getConfigs();
    expect(list).toHaveLength(1);
    expect((list[0] as unknown as { baseUrl: string }).baseUrl).toBe("https://new");
  });

  it("deletes a config", () => {
    ConfigManager.saveConfig(sample("a"));
    ConfigManager.saveConfig(sample("b"));
    ConfigManager.deleteConfig("a");
    expect(ConfigManager.getConfigs().map((c) => c.name)).toEqual(["b"]);
  });
});

describe("mergeConfigs (server sync)", () => {
  it("server wins on name clashes; local-only configs are kept for upload", () => {
    const server = [sample("shared"), sample("server-only")];
    const localShared = { ...sample("shared"), baseUrl: "https://stale-local" } as Config;
    const local = [localShared, sample("local-only")];

    const { merged, localOnly } = mergeConfigs(server, local);
    expect(merged.map((c) => c.name).sort()).toEqual(["local-only", "server-only", "shared"]);
    // The shared one is the SERVER version, not the stale local edit.
    expect(merged.find((c) => c.name === "shared")).toBe(server[0]);
    expect(localOnly.map((c) => c.name)).toEqual(["local-only"]);
  });

  it("handles empty sides", () => {
    expect(mergeConfigs([], [sample("a")]).localOnly).toHaveLength(1);
    expect(mergeConfigs([sample("a")], []).merged).toHaveLength(1);
  });
});
