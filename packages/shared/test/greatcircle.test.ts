import { describe, expect, it } from "vitest";
import { angleBetween, distanceKm, slerp, toLonLat, toVec } from "../src/index.js";

describe("great circle", () => {
  it("interpolates along the arc, exact at the ends and at the start when the points coincide", () => {
    const mid = slerp([0, 0], [10, 0], 0.5);
    expect(mid[0]).toBeCloseTo(5, 9);
    expect(mid[1]).toBeCloseTo(0, 9);
    const start = slerp([-122.42, 37.77], [-118.24, 34.05], 0);
    expect(start[0]).toBeCloseTo(-122.42, 9);
    expect(start[1]).toBeCloseTo(37.77, 9);
    const end = slerp([-122.42, 37.77], [-118.24, 34.05], 1);
    expect(end[0]).toBeCloseTo(-118.24, 9);
    expect(end[1]).toBeCloseTo(34.05, 9);
    expect(slerp([3, 4], [3, 4], 0.3)).toEqual([3, 4]);
  });

  it("measures distance and round-trips lon/lat through vectors", () => {
    expect(distanceKm([0, 0], [1, 0])).toBeCloseTo(111.195, 2);
    expect(angleBetween([0, 0], [0, 90])).toBeCloseTo(Math.PI / 2, 9);
    const back = toLonLat(toVec([-122.42, 37.77]));
    expect(back[0]).toBeCloseTo(-122.42, 9);
    expect(back[1]).toBeCloseTo(37.77, 9);
    expect(toLonLat([0, 0, 1.0000001])[1]).toBe(90);
  });
});
