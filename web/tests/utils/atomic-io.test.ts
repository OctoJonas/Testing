import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { atomicWriteJson } from "@/lib/utils/atomic-io";

describe("atomicWriteJson", () => {
  it("writes JSON atomically and leaves no temp files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-"));
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { a: 1, b: [2, 3] });
    const text = await fs.readFile(target, "utf-8");
    expect(JSON.parse(text)).toEqual({ a: 1, b: [2, 3] });
    const entries = await fs.readdir(dir);
    expect(entries.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
    await fs.rm(dir, { recursive: true });
  });

  it("creates the directory if it does not exist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-"));
    const target = path.join(dir, "nested", "deep", "out.json");
    await atomicWriteJson(target, { ok: true });
    const text = await fs.readFile(target, "utf-8");
    expect(JSON.parse(text)).toEqual({ ok: true });
    await fs.rm(dir, { recursive: true });
  });

  it("preserves the prior file when serialization throws", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-"));
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { v: 1 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(atomicWriteJson(target, circular)).rejects.toBeTruthy();
    const text = await fs.readFile(target, "utf-8");
    expect(JSON.parse(text)).toEqual({ v: 1 });
    await fs.rm(dir, { recursive: true });
  });
});
