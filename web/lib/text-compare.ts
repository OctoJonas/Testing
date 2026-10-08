/**
 * Lexical expected-vs-actual comparison for the result detail view.
 *
 * Heuristic, not semantic: a significant token from the expected answer that
 * never appears in the actual response is "missing". Good enough to spot a
 * forgotten URL, product name, or step at a glance; the LLM evaluation stays
 * the source of truth for correctness.
 */

/** Words too common (German + English) to signal a missing fact. */
const STOPWORDS = new Set([
  // German
  "aber", "alle", "auch", "beim", "bitte", "dann", "dass", "dein", "deine",
  "dem", "den", "der", "des", "die", "dies", "diese", "doch", "durch", "eine",
  "einem", "einen", "einer", "eines", "für", "haben", "hier", "ihre", "ist",
  "kann", "kannst", "mein", "meine", "mit", "nach", "nicht", "noch", "nun",
  "oder", "sich", "sicher", "sind", "über", "unter", "vom", "von", "wenn",
  "werden", "wird", "wieder", "wir", "deinem", "deiner", "stelle", "gehe",
  "klicke", "wähle", "sowie", "abschließend",
  // English
  "and", "are", "but", "for", "from", "has", "have", "into", "not", "that",
  "the", "this", "with", "will", "your", "you", "can", "please", "make",
  "sure", "then", "step",
]);

function normalize(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function isSignificant(normalized: string): boolean {
  if (!normalized) return false;
  if (STOPWORDS.has(normalized)) return false;
  // Numbers and short codes (443, 2FA) matter even when short.
  if (/\d/.test(normalized)) return true;
  return normalized.length >= 4;
}

/**
 * Normalized significant tokens from `expected` that never occur in `actual`
 * (substring match on the normalized actual text, so inflections like
 * "synchronisieren"/"Synchronisierung" still count as present).
 */
export function missingTokens(expected: string, actual: string): Set<string> {
  const haystack = actual.toLowerCase();
  const missing = new Set<string>();
  for (const raw of expected.split(/\s+/)) {
    const norm = normalize(raw);
    if (!isSignificant(norm)) continue;
    // Stem lightly: compare on the first 6+ chars so German suffixes
    // (-en, -ung, -e) don't cause false "missing" flags.
    const probe = norm.length > 6 ? norm.slice(0, Math.max(6, norm.length - 3)) : norm;
    if (!haystack.includes(probe)) missing.add(norm);
  }
  return missing;
}

export interface ExpectedSegment {
  text: string;
  missing: boolean;
}

/**
 * Split `expected` into render segments, marking tokens missing from
 * `actual`. Whitespace is preserved so the caller can join segments as-is.
 */
export function annotateExpected(expected: string, actual: string): ExpectedSegment[] {
  const missing = missingTokens(expected, actual);
  const segments: ExpectedSegment[] = [];
  for (const part of expected.split(/(\s+)/)) {
    if (!part) continue;
    const norm = normalize(part);
    segments.push({ text: part, missing: norm.length > 0 && missing.has(norm) });
  }
  return segments;
}
