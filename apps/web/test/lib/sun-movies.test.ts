import { SUN_FRAMES } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import { movieNote, SUN_MOVIES } from "../../src/lib/sun-movies.js";

describe("sun movies", () => {
  it("has both sizes for every channel in the strip", () => {
    for (const f of SUN_FRAMES) {
      const m = SUN_MOVIES[f.key];
      expect(m.src[512]).toMatch(/^https:\/\/(sdo\.gsfc|soho\.nascom)\.nasa\.gov\/.+\.mp4$/);
      expect(m.src[1024]).not.toBe(m.src[512]);
    }
    expect(SUN_MOVIES.hmib.src[1024]).toBe(
      "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_1024_HMIB.mp4",
    );
    expect(SUN_MOVIES.c2.hours).toBe(96);
  });

  it("names the movie's span against a window preset or a fixed range", () => {
    expect(movieNote(SUN_MOVIES.aia171, { kind: "window", id: "11y" }, "utc")).toBe(
      "Showing the last 48 hours only; the page shows 11 years.",
    );
    const fixed = {
      kind: "fixed" as const,
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-05T12:00:00Z"),
    };
    expect(movieNote(SUN_MOVIES.c3, fixed, "utc")).toBe(
      "Showing about the last 4 days only; the page shows 2026-10-01 00:00 to 2026-10-05 12:00 UTC.",
    );
  });
});
