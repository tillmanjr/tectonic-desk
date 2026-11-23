import { describe, expect, it } from "vitest";
import { layerAt, measureLines, measureOf, PREM_LAYERS } from "../../src/lib/measure.js";

describe("measure", () => {
  it("reads a quarter of the globe: Δ 90°, chord R√2, dipping R(1 − cos 45°) into the lower mantle", () => {
    const m = measureOf([0, 0], [90, 0]);
    expect(m.deltaDeg).toBeCloseTo(90, 9);
    expect(m.surfaceKm).toBeCloseTo((Math.PI / 2) * 6371, 6);
    expect(m.chordKm).toBeCloseTo(Math.SQRT2 * 6371, 6);
    expect(m.dipKm).toBeCloseTo(6371 * (1 - Math.SQRT1_2), 6);
    expect(m.layer).toBe("lower mantle");
  });

  it("keeps a short chord in the crust and an antipodal one through the inner core", () => {
    const short = measureOf([-122, 37], [-121, 37]);
    expect(short.surfaceKm).toBeCloseTo(88.8, 0);
    expect(short.chordKm).toBeLessThan(short.surfaceKm);
    expect(short.dipKm).toBeLessThan(1);
    expect(short.layer).toBe("crust");
    const through = measureOf([0, 0], [180, 0]);
    expect(through.dipKm).toBeCloseTo(6371, 6);
    expect(through.layer).toBe("inner core");
  });

  it("names PREM's layers by depth", () => {
    expect(PREM_LAYERS.map((l) => l.name)).toEqual([
      "crust",
      "upper mantle",
      "transition zone",
      "lower mantle",
      "outer core",
      "inner core",
    ]);
    expect(layerAt(24)).toBe("crust");
    expect(layerAt(24.4)).toBe("upper mantle");
    expect(layerAt(500)).toBe("transition zone");
    expect(layerAt(3000)).toBe("outer core");
    expect(layerAt(6000)).toBe("inner core");
    expect(layerAt(7000)).toBe("inner core");
  });

  it("writes the two lines, tenths of a km under 10 km and grouped thousands above", () => {
    expect(measureLines(measureOf([0, 0], [90, 0]))).toEqual([
      "Δ 90.00° · surface 10,008 km",
      "chord 9,010 km · dips 1,866 km, lower mantle",
    ]);
    expect(measureLines(measureOf([0, 0], [0, 0.05]))).toEqual([
      "Δ 0.05° · surface 5.6 km",
      "chord 5.6 km · dips 0.0 km, crust",
    ]);
  });
});
