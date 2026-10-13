import { describe, expect, it } from "vitest";
import { beachballSize, markerRadius } from "../../src/lib/markers.js";

describe("markers", () => {
  it("grows with magnitude above the floor, differently per view", () => {
    expect(markerRadius(4.5, 4.5, true)).toBeCloseTo(1.6 + 0.4 ** 1.55 * 2.6, 6);
    expect(markerRadius(2.5, 2.5, false)).toBeCloseTo(1.8 + 0.3 ** 1.5 * 2.6, 6);
    expect(markerRadius(2, 4.5, true)).toBe(1.6);
    expect(markerRadius(7.5, 4.5, true)).toBeGreaterThan(markerRadius(6.5, 4.5, true));
  });
  it("sizes beachballs with a floor", () => {
    expect(beachballSize(4.5, true)).toBe(16);
    expect(beachballSize(7, true)).toBe(27);
    expect(beachballSize(2.5, false)).toBe(15);
    expect(beachballSize(4, false)).toBeCloseTo(17.6, 6);
  });
});
