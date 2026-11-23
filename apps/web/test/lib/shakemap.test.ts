import { geoArea } from "d3-geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../src/lib/api.js";
import {
  hasShakeMap,
  loadShakeMap,
  mmiAt,
  mmiText,
  resetShakeCache,
  shakeBands,
  shakeCaption,
  shakeExtent,
} from "../../src/lib/shakemap.js";
import { fakeApi } from "../support/api.js";
import { coneGrid, shakeMap } from "../support/shakemap.js";

describe("shakemap", () => {
  afterEach(() => {
    resetShakeCache();
  });

  it("says whether the feed lists a ShakeMap", () => {
    expect(hasShakeMap({ types: ["origin", "shakemap"] })).toBe(true);
    expect(hasShakeMap({ types: ["origin"] })).toBe(false);
  });

  it("contours the grid into nested bands from II up, centred on the peak, in USGS colours", () => {
    const grid = coneGrid(-120, 36, 7.2);
    const bands = shakeBands(grid);
    // Peak 7.2 falls a unit a node to 3.2 at the edge (the uncomputed corners read as 0, so II
    // closes just inside them): bands II (≥ 1.5) to VII (≥ 6.5).
    expect(bands.map((b) => b.roman)).toEqual(["II", "III", "IV", "V", "VI", "VII"]);
    expect(bands[0]?.color).toBe("#bfccff");
    const areas = bands.map((b) => geoArea(b.shape));
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeLessThan(areas[i - 1] ?? 0);
    }
    // Small, so wound as d3-geo expects rather than covering the rest of the sphere.
    expect(areas[0]).toBeLessThan(0.01);
    const ring = bands[5]?.shape.coordinates[0]?.[0] ?? [];
    const lons = ring.map((p) => Number(p[0]));
    const lats = ring.map((p) => Number(p[1]));
    expect(Math.min(...lons)).toBeGreaterThan(-120.5);
    expect(Math.max(...lons)).toBeLessThan(-119.5);
    expect(Math.min(...lats)).toBeGreaterThan(35.5);
    expect(Math.max(...lats)).toBeLessThan(36.5);
  });

  it("draws no band below II, treating uncomputed nodes as none", () => {
    const flat = { ...coneGrid(), mmi: coneGrid().mmi.map(() => 1.2) };
    expect(shakeBands(flat)).toEqual([]);
  });

  it("outlines the grid's extent as a small clockwise ring, a point per degree", () => {
    const ext = shakeExtent(coneGrid(-120, 36));
    const ring = ext.coordinates[0] ?? [];
    expect(ring[0]).toEqual([-122, 34]);
    expect(ring[ring.length - 1]).toEqual([-122, 34]);
    expect(ring).toContainEqual([-122, 38]);
    expect(ring).toContainEqual([-118, 38]);
    expect(ring).toContainEqual([-118, 34]);
    expect(ring).toHaveLength(17);
    expect(geoArea(ext)).toBeLessThan(0.01);
    const tiny = shakeExtent({ ...coneGrid(), dLon: 0.01, dLat: 0.01 });
    expect(tiny.coordinates[0]).toHaveLength(5);
  });

  it("reads the nearest node, across the antimeridian, and null off the grid", () => {
    const grid = coneGrid(-120, 36, 7.2);
    expect(mmiAt(grid, -120, 36)).toBe(7.2);
    expect(mmiAt(grid, -119.4, 36.1)).toBe(6.2);
    expect(mmiAt(grid, -120 + 360, 36)).toBe(7.2);
    expect(mmiAt(grid, -122, 34)).toBeNull();
    expect(mmiAt(grid, -125, 36)).toBeNull();
    expect(mmiAt(grid, -120, 30)).toBeNull();
    expect(mmiAt(grid, -120, 40)).toBeNull();
    expect(mmiAt({ ...grid, mmi: [] }, -120, 36)).toBeNull();
    // Centred at 179.5° E, so −179.5° is 1° (two nodes) east of the peak.
    const dateline = coneGrid(179.5, 0);
    expect(mmiAt(dateline, -179.5, 0)).toBe(5.2);
  });

  it("words an intensity with its level, and nothing below I", () => {
    expect(mmiText(6.34)).toBe("MMI 6.3 · VI, strong shaking, light damage");
    expect(mmiText(3.1)).toBe("MMI 3.1 · III, weak shaking, no damage");
    expect(mmiText(0.4)).toBeNull();
  });

  it("captions the product with what it states", () => {
    expect(shakeCaption(shakeMap())).toBe("USGS ShakeMap · us · v4 · reviewed · max MMI 7.2");
    expect(shakeCaption(shakeMap({ version: null, mapStatus: null, maxMmi: null }))).toBe(
      "USGS ShakeMap · us",
    );
  });

  it("loads a ShakeMap once, treats a 404 as none and forgets a failure", async () => {
    const api = fakeApi();
    const [a, b] = await Promise.all([loadShakeMap(api, "us1"), loadShakeMap(api, "us1")]);
    expect(a).toEqual(shakeMap());
    expect(b).toBe(a);
    expect(api.shakemap).toHaveBeenCalledTimes(1);
    vi.mocked(api.shakemap).mockRejectedValueOnce(new ApiRequestError(404, "none"));
    expect(await loadShakeMap(api, "us2")).toBeNull();
    expect(await loadShakeMap(api, "us2")).toBeNull();
    vi.mocked(api.shakemap).mockRejectedValueOnce(new ApiRequestError(502, "down"));
    await expect(loadShakeMap(api, "us3")).rejects.toThrow("down");
    expect(await loadShakeMap(api, "us3")).toEqual(shakeMap());
    expect(api.shakemap).toHaveBeenCalledTimes(4);
  });
});
