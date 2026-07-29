import { describe, expect, it } from "vitest";
import { formatSince } from "./format";

const NOW = new Date("2026-07-01T12:00:00.000Z").getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("formatSince", () => {
  it("viser 'lige nu' for under et minut", () => {
    expect(formatSince(ago(20_000), NOW)).toBe("lige nu");
  });

  it("viser minutter", () => {
    expect(formatSince(ago(5 * 60_000), NOW)).toBe("for 5 min. siden");
  });

  it("bruger ental for én time", () => {
    expect(formatSince(ago(60 * 60_000), NOW)).toBe("for 1 time siden");
  });

  it("bruger flertal for flere timer", () => {
    expect(formatSince(ago(3 * 60 * 60_000), NOW)).toBe("for 3 timer siden");
  });

  it("viser dage", () => {
    expect(formatSince(ago(2 * 24 * 60 * 60_000), NOW)).toBe("for 2 dage siden");
  });
});
