import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, initDb } from "@/lib/db";
import { deleteConfig, listConfigs, upsertConfig } from "@/lib/repos/configs";

const sample = (name: string, baseUrl = "https://x.octonomy.ai") => ({
  name,
  widgetId: "d2lkZ2V0",
  baseUrl,
  origin: "https://o.example",
  referer: "https://o.example/",
});

beforeEach(() => initDb(":memory:"));
afterEach(() => closeDb());

describe("configs repo", () => {
  it("upserts and lists configs sorted by name", () => {
    upsertConfig(sample("beta"));
    upsertConfig(sample("alpha"));
    expect(listConfigs().map((c) => c.name)).toEqual(["alpha", "beta"]);
  });

  it("upsert replaces by name instead of duplicating", () => {
    upsertConfig(sample("a"));
    upsertConfig(sample("a", "https://changed.octonomy.ai"));
    const list = listConfigs();
    expect(list).toHaveLength(1);
    expect(list[0].baseUrl).toBe("https://changed.octonomy.ai");
  });

  it("deletes by name", () => {
    upsertConfig(sample("a"));
    expect(deleteConfig("a")).toBe(true);
    expect(deleteConfig("a")).toBe(false);
    expect(listConfigs()).toHaveLength(0);
  });
});
