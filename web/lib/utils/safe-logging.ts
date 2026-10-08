/**
 * Safe-logging helpers. Never log raw tokens — fingerprint them so logs can
 * still be correlated without exposing material that ends up in log
 * aggregators.
 */
import { createHash } from "node:crypto";

export function fingerprint(secret: string | null | undefined, length = 8): string {
  if (!secret) return "none";
  return createHash("sha256").update(secret, "utf-8").digest("hex").slice(0, length);
}

export function hasToken(secret: string | null | undefined): string {
  return secret ? `yes (fp=${fingerprint(secret)})` : "no";
}
