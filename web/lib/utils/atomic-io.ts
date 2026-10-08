/**
 * Atomic JSON writes — write to a sibling temp file, fsync, rename.
 * A crash mid-write leaves the previous file intact.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export async function atomicWriteJson(
  path: string,
  data: unknown,
  { indent = 2 }: { indent?: number } = {},
): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const fh = await fs.open(tmp, "w", 0o600);
    try {
      await fh.writeFile(JSON.stringify(data, null, indent), "utf-8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, path);
  } catch (err) {
    fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}
