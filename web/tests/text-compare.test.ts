import { describe, expect, it } from "vitest";

import { annotateExpected, missingTokens } from "@/lib/text-compare";

describe("missingTokens", () => {
  it("flags significant terms absent from the actual answer", () => {
    const expected = "Starte die Mailstore Anwendung über die Programmsuche";
    const actual = "Bitte wenden Sie sich an den Support.";
    const missing = missingTokens(expected, actual);
    expect(missing.has("mailstore")).toBe(true);
    expect(missing.has("programmsuche")).toBe(true);
    // Stopwords never flagged.
    expect(missing.has("über")).toBe(false);
    expect(missing.has("die")).toBe(false);
  });

  it("does not flag terms that are present (case-insensitive)", () => {
    const expected = "Öffne OneDrive und klicke auf Synchronisieren";
    const actual = "Prüfen Sie zunächst, ob ONEDRIVE läuft, dann die Synchronisierung starten.";
    const missing = missingTokens(expected, actual);
    expect(missing.has("onedrive")).toBe(false);
    // Light stemming: "synchronisieren" matches "Synchronisierung".
    expect(missing.has("synchronisieren")).toBe(false);
  });

  it("treats numbers and codes as significant even when short", () => {
    const expected = "Server Port 443 verwenden";
    const missing = missingTokens(expected, "Verwenden Sie den Standardserver.");
    expect(missing.has("443")).toBe(true);
  });
});

describe("annotateExpected", () => {
  it("preserves the original text across segments", () => {
    const expected = "OneDrive  läuft im Hintergrund.";
    const segments = annotateExpected(expected, "irrelevant");
    expect(segments.map((s) => s.text).join("")).toBe(expected);
  });

  it("marks only missing significant tokens", () => {
    const segments = annotateExpected("Öffne Mailstore jetzt", "Jetzt öffnen wir etwas anderes");
    const marked = segments.filter((s) => s.missing).map((s) => s.text);
    expect(marked).toEqual(["Mailstore"]);
  });
});
