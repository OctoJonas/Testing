/**
 * Field-level validators for the widget config form.
 *
 * Used both at save time (client-side guard rails before localStorage write)
 * and live as the user types (rendered as red text under the field).
 *
 * Returning `null` means valid; a string is the error message to render.
 */
export type FieldName = "name" | "widgetId" | "baseUrl" | "origin" | "referer";

export interface ConfigDraft {
  name: string;
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
}

export type FieldErrors = Partial<Record<FieldName, string>>;

const HTTP_URL = /^https?:\/\/[^\s/]+/i;

function looksLikeBase64(value: string): boolean {
  // Tolerate URL-safe base64 too. Length divisible by 4 with optional padding.
  return /^[A-Za-z0-9+/_-]+={0,2}$/.test(value) && value.length >= 8;
}

function decodesToUtf8(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 0) return false;
    const decoded = buf.toString("utf-8");
    return !decoded.includes("�");
  } catch {
    return false;
  }
}

export function validateName(v: string): string | null {
  if (!v.trim()) return "Configuration name is required.";
  if (v.length > 256) return "Name is too long (max 256 characters).";
  return null;
}

export function validateWidgetId(v: string): string | null {
  if (!v.trim()) return "Widget ID is required.";
  if (v === "your-widget-id-here") return "That's the placeholder; paste your real Widget ID.";
  if (!looksLikeBase64(v)) {
    return "Widget ID should be a base64 string from your Octonomy embed snippet.";
  }
  // Cheap path uses Buffer (Node-side); on the client this only runs in
  // browser, where Buffer is polyfilled by Next via the `buffer` shim.
  if (typeof Buffer !== "undefined" && !decodesToUtf8(v)) {
    return "Widget ID base64-decodes to non-UTF-8 bytes — copy the full token from the embed snippet.";
  }
  return null;
}

export function validateUrl(v: string, label: string): string | null {
  if (!v.trim()) return `${label} is required.`;
  if (!HTTP_URL.test(v)) return `${label} must start with http:// or https://`;
  try {
    new URL(v);
  } catch {
    return `${label} is not a valid URL.`;
  }
  return null;
}

export function validateBaseUrl(v: string): string | null {
  return validateUrl(v, "Base URL");
}

export function validateOrigin(v: string): string | null {
  const err = validateUrl(v, "Origin");
  if (err) return err;
  if (v.endsWith("/")) {
    return "Origin should not have a trailing slash (use Referer for that).";
  }
  return null;
}

export function validateReferer(v: string): string | null {
  const err = validateUrl(v, "Referer");
  if (err) return err;
  if (!v.endsWith("/")) {
    return "Referer should end with a trailing slash, e.g. https://example.com/.";
  }
  return null;
}

export function validateConfigDraft(draft: ConfigDraft): FieldErrors {
  const errors: FieldErrors = {};
  const n = validateName(draft.name);
  if (n) errors.name = n;
  const w = validateWidgetId(draft.widgetId);
  if (w) errors.widgetId = w;
  const b = validateBaseUrl(draft.baseUrl);
  if (b) errors.baseUrl = b;
  const o = validateOrigin(draft.origin);
  if (o) errors.origin = o;
  const r = validateReferer(draft.referer);
  if (r) errors.referer = r;
  return errors;
}

export function isValid(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}
