import { describe, expect, it } from "vitest";
import { beachballSize, markerRadius, ZOOM_SHRINK } from "../../src/lib/markers.js";

describe("markers", () => {
  it("grows with magnitude above the floor, differently per view", () => {
    expect(markerRadius(4.5, 4.5, true)).toBeCloseTo(0.8 + 0.3 ** 1.5 * 1.3, 6);
    expect(markerRadius(2.5, 2.5, false)).toBeCloseTo(0.9 + 0.3 ** 1.5 * 1.3, 6);
    expect(markerRadius(2, 4.5, true)).toBe(0.8);
    expect(markerRadius(7.5, 4.5, true)).toBeGreaterThan(markerRadius(6.5, 4.5, true));
    expect(markerRadius(7, 4.5, true)).toBeLessThan(7);
    expect(markerRadius(7, 6, true)).toBeLessThan(markerRadius(7, 4.5, true));
  });
  it("sizes beachballs with a floor", () => {
    expect(beachballSize(4.5, true)).toBe(10);
    expect(beachballSize(7, true)).toBe(16.5);
    expect(beachballSize(2.5, false)).toBe(10);
    expect(beachballSize(4.5, false)).toBeCloseTo(13.65, 6);
  });
  it("lets markers grow about fivefold on screen across the zoom range", () => {
    expect(40 ** (1 - ZOOM_SHRINK)).toBeCloseTo(5.07, 1);
  });
});
