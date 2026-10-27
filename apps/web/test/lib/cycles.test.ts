import { describe, expect, it } from "vitest";
import {
  CYCLE_MARK_MIN_MS,
  CYCLES,
  cycleMarks,
  cycleNote,
  cyclesWithin,
} from "../../src/lib/cycles.js";

const at = (iso: string): Date => new Date(iso);

describe("solar cycles", () => {
  it("lists cycles 17 to 25 by their minima, the last one still rising", () => {
    expect(CYCLES.map((c) => c.number)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25]);
    expect(CYCLES[0]?.minimum.toISOString()).toBe("1933-09-01T00:00:00.000Z");
    expect(CYCLES[7]?.maximum?.toISOString()).toBe("2014-04-01T00:00:00.000Z");
    expect(CYCLES[8]?.maximum).toBeNull();
    expect(
      cycleNote(CYCLES[7] ?? { number: 0, minimum: at("2000-01-01T00:00:00Z"), maximum: null }),
    ).toBe("Minimum Dec 2008, maximum Apr 2014");
    expect(
      cycleNote(CYCLES[8] ?? { number: 0, minimum: at("2000-01-01T00:00:00Z"), maximum: null }),
    ).toBe("Minimum Dec 2019");
  });

  it("finds the minima inside a window", () => {
    const numbers = (from: string, to: string) =>
      cyclesWithin(at(from), at(to)).map((c) => c.number);
    expect(numbers("1932-01-01T00:00:00Z", "2026-10-26T00:00:00Z")).toEqual([
      17, 18, 19, 20, 21, 22, 23, 24, 25,
    ]);
    expect(numbers("1990-01-01T00:00:00Z", "2026-10-26T00:00:00Z")).toEqual([23, 24, 25]);
    expect(numbers("2008-12-01T00:00:00Z", "2019-12-01T00:00:00Z")).toEqual([24, 25]);
    expect(numbers("2020-01-01T00:00:00Z", "2026-10-26T00:00:00Z")).toEqual([]);
  });

  it("marks a window longer than two years and nothing shorter", () => {
    expect(CYCLE_MARK_MIN_MS).toBe(2 * 365.25 * 86_400_000);
    const x = (d: Date): number => d.getUTCFullYear();
    const marks = cycleMarks(at("1990-01-01T00:00:00Z"), at("2026-10-26T00:00:00Z"), x);
    expect(marks).toEqual([
      {
        era: { year: 1996, label: "Cycle 23", note: "Minimum Aug 1996, maximum Nov 2001" },
        x: 1996,
      },
      {
        era: { year: 2008, label: "Cycle 24", note: "Minimum Dec 2008, maximum Apr 2014" },
        x: 2008,
      },
      { era: { year: 2019, label: "Cycle 25", note: "Minimum Dec 2019" }, x: 2019 },
    ]);
    expect(cycleMarks(at("2018-01-01T00:00:00Z"), at("2020-01-01T00:00:00Z"), x)).toEqual([]);
    expect(cycleMarks(at("2018-01-01T00:00:00Z"), at("2020-01-02T00:00:00Z"), x)).toHaveLength(1);
  });
});
