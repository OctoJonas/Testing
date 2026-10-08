/**
 * Browser-side API base URL. Defaults to empty string (same-origin) so all
 * fetches use relative paths against the Next.js server. Override via
 * NEXT_PUBLIC_API_URL only when the API lives on a different host.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
