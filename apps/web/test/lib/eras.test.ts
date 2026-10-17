import { describe, expect, it } from "vitest";
import { ERAS, eraStart, erasWithin } from "../../src/lib/eras.js";

describe("eras", () => {
  it("lists the three catalogue breaks with their notes", () => {
    expect(ERAS.map((e) => [e.year, e.label])).toEqual([
      [1964, "WWSSN"],
      [1973, "PDE"],
      [1976, "GCMT"],
    ]);
    expect(eraStart(ERAS[0] ?? { year: 0, label: "", note: "" }).toISOString()).toBe(
      "1964-01-01T00:00:00.000Z",
    );
  });
  it("returns the eras whose start lies inside a closed window", () => {
    const years = (from: string, to: string) =>
      erasWithin(new Date(from), new Date(to)).map((e) => e.year);
    expect(years("1900-01-01T00:00:00Z", "2026-10-13T00:00:00Z")).toEqual([1964, 1973, 1976]);
    expect(years("1964-01-01T00:00:00Z", "1976-01-01T00:00:00Z")).toEqual([1964, 1973, 1976]);
    expect(years("1964-01-01T00:00:01Z", "1975-12-31T00:00:00Z")).toEqual([1973]);
    expect(years("2026-09-13T00:00:00Z", "2026-10-13T00:00:00Z")).toEqual([]);
  });
});
