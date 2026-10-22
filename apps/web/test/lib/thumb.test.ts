import type { Basemap } from "../../src/lib/geo.js";
import { describe, expect, it } from "vitest";
import { outlinePath, starPath, THUMB, thumbProjection } from "../../src/lib/thumb.js";

const bbox = { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 };
const square: Basemap = {
  land: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-120, 30],
              [-110, 30],
              [-110, 40],
              [-120, 40],
              [-120, 30],
            ],
          ],
        },
      },
    ],
  },
  borders: { type: "MultiLineString", coordinates: [] },
};

describe("thumb", () => {
  it("fits the world and the West Coast into the thumb box", () => {
    const world = thumbProjection("world", null);
    const p = world([0, 0]);
    expect(p?.[0]).toBeGreaterThan(0);
    expect(p?.[0]).toBeLessThan(THUMB.width);
    const wc = thumbProjection("wc", bbox);
    const q = wc([-120, 40]);
    expect(q?.[0]).toBeGreaterThan(0);
    expect(q?.[1]).toBeLessThan(THUMB.height);
    expect(thumbProjection("wc", null)([0, 0])).toEqual(world([0, 0]));
  });

  it("renders the land to one path and draws a five-point star", () => {
    const d = outlinePath(square, thumbProjection("wc", bbox));
    expect(d.startsWith("M")).toBe(true);
    expect(
      outlinePath(
        { ...square, land: { type: "FeatureCollection", features: [] } },
        thumbProjection("world", null),
      ),
    ).toBe("");
    const star = starPath(10, 10, 5);
    expect(star.split("L")).toHaveLength(10);
    expect(star.startsWith("M10.00,5.00")).toBe(true);
    expect(star.endsWith("Z")).toBe(true);
  });
});
