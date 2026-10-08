import { describe, expect, it } from "vitest";

import { formatEta } from "@/components/TestPilot/TestProgress";

describe("formatEta", () => {
  it("rounds short waits to 5s steps", () => {
    expect(formatEta(12)).toBe("~10s remaining");
    expect(formatEta(43)).toBe("~45s remaining");
  });

  it("uses minutes above one minute", () => {
    expect(formatEta(95)).toBe("~2 min remaining");
    expect(formatEta(600)).toBe("~10 min remaining");
  });

  it("handles edge values", () => {
    expect(formatEta(0)).toBe("almost done");
    expect(formatEta(Number.NaN)).toBe("almost done");
  });
});
