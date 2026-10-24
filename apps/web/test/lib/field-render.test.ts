import { describe, expect, it } from "vitest";
import {
  albersForward,
  colourAt,
  colourAtPosition,
  DDS9_ALBERS,
  equalisedStops,
  linearStops,
  positionOf,
  quantise,
  RAMP,
  renderRaster,
  sampleLonLat,
  sampleProjected,
  type LonLatGrid,
  type ProjectedGrid,
} from "../../src/lib/field-render.js";

/** A 4×2 lon/lat grid, row 0 south: 90° cells, pixel-registered from -180/-90. */
const grid: LonLatGrid = {
  width: 4,
  height: 2,
  values: new Float32Array([0, 10, 20, 30, 40, 50, 60, NaN]),
};

describe("sampleLonLat", () => {
  it("returns the cell value at a cell centre and interpolates between centres", () => {
    expect(sampleLonLat(grid, -135, -45)).toBe(0);
    expect(sampleLonLat(grid, -45, -45)).toBe(10);
    expect(sampleLonLat(grid, -90, -45)).toBe(5);
    expect(sampleLonLat(grid, -135, 0)).toBe(20);
  });

  it("wraps across the dateline and clamps at the poles", () => {
    expect(sampleLonLat(grid, 180, -45)).toBe(15);
    expect(sampleLonLat(grid, -180, -45)).toBe(15);
    expect(sampleLonLat(grid, -135, -89)).toBe(0);
    expect(sampleLonLat(grid, -135, 89)).toBe(40);
  });

  it("is NaN beside a missing cell that carries weight, and ignores one that does not", () => {
    expect(sampleLonLat(grid, 100, 20)).toBeNaN();
    expect(sampleLonLat(grid, 45, 0)).toBe(40);
    expect(sampleLonLat(grid, 45, -45)).toBe(20);
  });
});

describe("sampleProjected", () => {
  const pg: ProjectedGrid = {
    width: 3,
    height: 2,
    values: new Float32Array([1, 2, 3, 4, 5, NaN]),
    locate: (lon, lat) => (lon < 0 ? null : [lon, lat]),
  };

  it("samples at fractional grid positions and is NaN off the grid or by a dummy", () => {
    expect(sampleProjected(pg, 0, 0)).toBe(1);
    expect(sampleProjected(pg, 1, 0)).toBe(2);
    expect(sampleProjected(pg, 0.5, 0.5)).toBe(3);
    expect(sampleProjected(pg, -1, 0)).toBeNaN();
    expect(sampleProjected(pg, 2, 1)).toBeNaN();
    expect(sampleProjected(pg, 1.5, 0.5)).toBeNaN();
  });
});

describe("albersForward", () => {
  // Nodes read from isograv.xyz (USGS DDS-9): x = -2574000 + col·4000, y = 2539000 + row·4000.
  it("lands USGS XYZ nodes on grid nodes within 20 m", () => {
    const nodes: [number, number][] = [
      [-97.657, 24.6384],
      [-97.618, 24.639],
      [-97.5011, 24.6408],
    ];
    for (const [lon, lat] of nodes) {
      const [x, y] = albersForward(DDS9_ALBERS, lon, lat);
      const col = (x - DDS9_ALBERS.xOrigin) / 4000;
      const row = (y - DDS9_ALBERS.yOrigin) / 4000;
      expect(Math.abs(col - Math.round(col)) * 4000).toBeLessThan(20);
      expect(Math.abs(row - Math.round(row)) * 4000).toBeLessThan(20);
    }
  });
});

describe("ramps", () => {
  it("spreads linear stops symmetrically", () => {
    const s = linearStops(100, RAMP);
    expect(s.map(([v]) => v)).toEqual([-100, -50, 0, 50, 100]);
    expect(s[0]?.[1]).toBe(RAMP[0]);
    expect(s[4]?.[1]).toBe(RAMP[4]);
  });

  it("places equalised stops at percentiles of the finite values", () => {
    const values = new Float32Array([NaN, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const got = equalisedStops(values, RAMP).map(([v]) => v);
    expect(got.map((v) => Number(v.toFixed(3)))).toEqual([0.2, 2.6, 5, 7.4, 9.8]);
    expect(equalisedStops(new Float32Array([NaN]), RAMP).map(([v]) => v)).toEqual([0, 0, 0, 0, 0]);
  });

  it("interpolates colours and clamps at the ends", () => {
    const s: [number, string][] = [
      [0, "#000000"],
      [10, "#ff0000"],
    ];
    expect(colourAt(s, -5)).toEqual([0, 0, 0]);
    expect(colourAt(s, 5)).toEqual([128, 0, 0]);
    expect(colourAt(s, 15)).toEqual([255, 0, 0]);
    expect(colourAt([], 1)).toEqual([0, 0, 0]);
    const three: [number, string][] = [
      [0, "#000000"],
      [1, "#101010"],
      [2, "#ffffff"],
    ];
    expect(colourAt(three, 1.5)).toEqual([136, 136, 136]);
  });
});

describe("positions and quantise", () => {
  it("places a value along the ramp by its stops, not by value, and clamps", () => {
    const stops: [number, string][] = [
      [-1000, "#000000"],
      [-10, "#111111"],
      [0, "#222222"],
      [10, "#333333"],
      [1000, "#444444"],
    ];
    expect(positionOf(stops, -2000)).toBe(0);
    expect(positionOf(stops, -10)).toBe(0.25);
    expect(positionOf(stops, 5)).toBe(0.625);
    expect(positionOf(stops, 1000)).toBe(1);
    expect(positionOf(stops, 5000)).toBe(1);
    expect(positionOf([], 1)).toBe(0);
    expect(positionOf([[1, "#000000"]], 1)).toBe(0);
  });

  it("snaps a position to its band centre", () => {
    expect(quantise(0)).toBe(0.5 / 64);
    expect(quantise(0.1601)).toBe(10.5 / 64);
    expect(quantise(1)).toBe(63.5 / 64);
    expect(quantise(-1)).toBe(0.5 / 64);
    expect(quantise(2)).toBe(63.5 / 64);
  });

  it("colours a position between its two stops and survives degenerate stop lists", () => {
    const stops: [number, string][] = [
      [0, "#000000"],
      [1, "#101010"],
      [2, "#ffffff"],
    ];
    expect(colourAtPosition(stops, 0.25)).toEqual([8, 8, 8]);
    expect(colourAtPosition(stops, 1)).toEqual([255, 255, 255]);
    expect(colourAtPosition([], 0.5)).toEqual([0, 0, 0]);
    expect(colourAtPosition([[0, "#102030"]], 0.5)).toEqual([16, 32, 48]);
  });
});

describe("renderRaster", () => {
  it("writes RGBA with transparent pixels off the map and on missing data", () => {
    const stops: [number, string][] = [
      [0, "#000000"],
      [1, "#ffffff"],
    ];
    const px = renderRaster(
      3,
      1,
      (x, y) => (x < 1 ? null : [x, y]),
      (lon) => (lon > 2 ? NaN : 1),
      stops,
    );
    // Value 1 sits in the top band, whose centre is 63.5/64 of the way to white.
    expect(Array.from(px)).toEqual([0, 0, 0, 0, 253, 253, 253, 255, 0, 0, 0, 0]);
  });
});
