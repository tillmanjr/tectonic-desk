import { geoContains } from "d3-geo";
import { describe, expect, it } from "vitest";
import {
  MAP_SIZE,
  nightRing,
  polarGraticule,
  polarProjection,
  timeMarks,
} from "../../src/lib/aurora-map.js";

const point = (p: [number, number] | null): [number, number] => {
  if (p === null) throw new Error("off the map");
  return p;
};

describe("polarProjection", () => {
  it("centres the pole, puts the subsolar meridian at the top and clips at 40°", () => {
    const north = polarProjection("north", 30);
    const [cx, cy] = point(north([0, 90]));
    expect(cx).toBeCloseTo(MAP_SIZE / 2, 3);
    expect(cy).toBeCloseTo(MAP_SIZE / 2, 3);
    const [nx, ny] = point(north([30, 60]));
    expect(nx).toBeCloseTo(MAP_SIZE / 2, 3);
    expect(ny).toBeLessThan(MAP_SIZE / 2);
    const [, my] = point(north([-150, 60]));
    expect(my).toBeGreaterThan(MAP_SIZE / 2);
    // 90° east of the subsolar meridian is 18 local time: the left of the north view
    const [ex] = point(north([120, 60]));
    expect(ex).toBeLessThan(MAP_SIZE / 2);
    const [mx] = point(north([-60, 60]));
    expect(mx).toBeGreaterThan(MAP_SIZE / 2);
    expect(north.clipAngle()).toBe(50);
    const [rx, ry] = point(north([30, 40]));
    expect(Math.hypot(rx - MAP_SIZE / 2, ry - MAP_SIZE / 2)).toBeCloseTo(MAP_SIZE / 2, 0);

    const south = polarProjection("south", 30, 200);
    const [sx, sy] = point(south([0, -90]));
    expect([sx, sy]).toEqual([100, 100]);
    const [, ty] = point(south([30, -60]));
    expect(ty).toBeLessThan(100);
    // and on the south view, seen from outside, east (18 local time) is on the right
    const [wx] = point(south([120, -60]));
    expect(wx).toBeGreaterThan(100);
  });

  it("shades the hemisphere opposite the Sun", () => {
    const night = nightRing([30, 10]);
    expect(geoContains(night, [-150, -10])).toBe(true);
    expect(geoContains(night, [-150, 60])).toBe(true);
    expect(geoContains(night, [30, 10])).toBe(false);
    expect(geoContains(night, [30, 80])).toBe(false);
  });

  it("draws a 30° by 10° graticule and names the local times around the rim", () => {
    const g = polarGraticule();
    expect(g.type).toBe("MultiLineString");
    expect(g.coordinates.length).toBeGreaterThan(20);
    expect(timeMarks("north")).toEqual([
      { label: "12", side: "top" },
      { label: "00", side: "bottom" },
      { label: "06", side: "right" },
      { label: "18", side: "left" },
    ]);
    expect(timeMarks("south").map((m) => `${m.label}:${m.side}`)).toEqual([
      "12:top",
      "00:bottom",
      "06:left",
      "18:right",
    ]);
  });
});
