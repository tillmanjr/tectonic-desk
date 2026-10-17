import { describe, expect, it } from "vitest";
import { cellRing, DENSITY_RAMP, densityLegendFor, densityOpacity } from "../../src/lib/density.js";
import { RAISED_GRID } from "../support/api.js";

describe("density", () => {
  it("maps counts to opacity on a log scale between the ramp ends", () => {
    const o = densityOpacity(1000);
    expect(o(1)).toBeCloseTo(DENSITY_RAMP[0] ?? 0, 5);
    expect(o(1000)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
    expect(o(10)).toBeGreaterThan(o(1));
    expect(o(5000)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
    expect(densityOpacity(1)(1)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
  });
  it("builds a clockwise ring from the south-west corner", () => {
    expect(cellRing(34, -120, 0.5).coordinates).toEqual([
      [
        [-120, 34],
        [-120, 34.5],
        [-119.5, 34.5],
        [-119.5, 34],
        [-120, 34],
      ],
    ]);
  });
  it("summarises a grid for the legend", () => {
    expect(densityLegendFor(RAISED_GRID, 4.5)).toEqual({ cell: 2, floor: 4.5, max: 5000 });
    expect(densityLegendFor({ ...RAISED_GRID, cells: [] }, 4.5).max).toBe(1);
  });
});
