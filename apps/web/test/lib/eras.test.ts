import { describe, expect, it } from "vitest";
import { ERAS, eraLabels, eraStart, erasWithin } from "../../src/lib/eras.js";

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
  it("steps crowded labels down a row and returns to the top once the row is clear", () => {
    const [wwssn, pde, gcmt] = ERAS;
    const marks = (xs: number[]) =>
      xs.map((x, i) => ({ era: [wwssn, pde, gcmt][i] ?? { year: 0, label: "", note: "" }, x }));
    // the 1900 window of the 520-unit chart: 1964 at 276, 1973 at 310, 1976 at 321
    expect(eraLabels(marks([276, 310, 321])).map((l) => l.tier)).toEqual([0, 1, 0]);
    // marks far apart share the top row
    expect(eraLabels(marks([100, 250, 400])).map((l) => l.tier)).toEqual([0, 0, 0]);
    // three marks within one label's width take three rows
    expect(eraLabels(marks([100, 110, 120])).map((l) => l.tier)).toEqual([0, 1, 2]);
    expect(eraLabels([])).toEqual([]);
  });
});
