import { geoPath, type GeoProjection } from "d3-geo";
import { describe, expect, it, vi } from "vitest";
import {
  frameFor,
  invertPoint,
  graticuleFor,
  loadWorld,
  pathOf,
  PLATE_CLASSES,
  plateFeature,
  type PlateSegment,
  regionBasemap,
  worldBasemap,
  zoomTransformFor,
} from "../../src/lib/geo.js";
import { GLOBAL, SQUARE_OBJECTS, squareTopology, WC } from "../support/events.js";

describe("frameFor", () => {
  it("fits the sphere for the global view", () => {
    const f = frameFor(GLOBAL);
    expect(f.global).toBe(true);
    expect([f.width, f.height]).toEqual([1000, 520]);
    expect(f.projection([0, 0])).not.toBeNull();
    expect(graticuleFor(f).type).toBe("MultiLineString");
  });
  it("fits a conic projection to the region's frame points or its bbox", () => {
    const wc = frameFor(WC);
    expect(wc.global).toBe(false);
    expect(wc.height).toBe(700);
    const seattle = wc.projection([-122.3, 47.6]);
    expect(seattle).not.toBeNull();
    if (seattle) expect(seattle[1]).toBeLessThan(wc.height / 2);
    const other = frameFor({
      ...WC,
      id: "global",
      bbox: { minLon: -10, minLat: 40, maxLon: 10, maxLat: 50 },
    });
    const centre = other.projection([0, 45]);
    expect(centre).not.toBeNull();
    if (centre) expect(Math.abs(centre[0] - 500)).toBeLessThan(5);
    expect(graticuleFor(wc).type).toBe("MultiLineString");
  });
  it("zoomTransformFor centres a point at 6x globally, 3x regionally, identity when unprojectable", () => {
    const g = zoomTransformFor(frameFor(GLOBAL), 0, 0);
    expect(g.k).toBe(6);
    const p = frameFor(GLOBAL).projection([0, 0]);
    expect(p).not.toBeNull();
    if (p) expect(g.applyX(p[0])).toBeCloseTo(500, 6);
    expect(zoomTransformFor(frameFor(WC), -122, 47).k).toBe(3);
    const invisible = (): null => null;
    const far = { ...frameFor(GLOBAL), projection: invisible as unknown as GeoProjection };
    expect(zoomTransformFor(far, 0, 0).k).toBe(1);
  });
  it("pathOf returns an empty string for empty geometry", () => {
    const p = geoPath(frameFor(GLOBAL).projection);
    expect(pathOf(p, { type: "MultiPoint", coordinates: [] })).toBe("");
    expect(pathOf(p, { type: "Sphere" })).toMatch(/^M/);
  });
});

describe("plates", () => {
  it("has four classes and converts segments to features", () => {
    expect(Object.keys(PLATE_CLASSES)).toEqual(["sub", "conv", "spread", "trans"]);
    const f = plateFeature({
      b: "AF-AN",
      c: "trans",
      v: 13.2,
      p: [
        [0, -54],
        [1, -54],
      ],
    });
    expect(f.geometry.coordinates).toHaveLength(2);
    expect(f.properties.title).toBe("Transform · AF-AN · 13.2 mm/yr relative (PB2002)");
    expect(f.properties.overriding).toBeNull();
  });
  it("names the polarity on subduction steps and falls back to codes", () => {
    const seg = (b: string, c: PlateSegment["c"]): PlateSegment => ({
      b,
      c,
      v: 60,
      p: [
        [0, 0],
        [1, 1],
      ],
    });
    const ke = plateFeature(seg("KE/PA", "sub"));
    expect(ke.properties.overriding).toBe("left");
    expect(ke.properties.title).toContain("Pacific subducts under Kermadec");
    const nz = plateFeature(seg("NZ\\SA", "sub"));
    expect(nz.properties.overriding).toBe("right");
    expect(nz.properties.title).toContain("Nazca subducts under South America");
    expect(plateFeature(seg("XX/PA", "sub")).properties.title).toContain(
      "Pacific subducts under XX",
    );
    expect(plateFeature(seg("PA/AU", "trans")).properties.overriding).toBeNull();
    expect(plateFeature(seg("PA-NA", "sub")).properties.overriding).toBeNull();
    expect(PLATE_CLASSES.sub.teeth).toBe(true);
  });
});

describe("basemaps", () => {
  it("extracts land and borders from the world topology", () => {
    const b = worldBasemap(squareTopology);
    expect(b.land.type).toBe("FeatureCollection");
    expect(b.borders.type).toBe("MultiLineString");
    expect(() => worldBasemap({ ...squareTopology, objects: {} })).toThrow("land");
    expect(() =>
      worldBasemap({ ...squareTopology, objects: { land: SQUARE_OBJECTS.land } }),
    ).toThrow("countries");
  });
  it("wraps a single geometry into a collection", () => {
    const single = {
      ...squareTopology,
      objects: {
        land: { type: "Polygon" as const, arcs: [[0]] },
        countries: SQUARE_OBJECTS.countries,
      },
    };
    expect(worldBasemap(single).land.features).toHaveLength(1);
  });
  it("extracts the first object of the region land and states files", () => {
    const b = regionBasemap(squareTopology, squareTopology);
    expect(b.land.type).toBe("FeatureCollection");
    expect(b.borders.type).toBe("MultiLineString");
    expect(() => regionBasemap({ ...squareTopology, objects: {} }, squareTopology)).toThrow(
      "no objects",
    );
  });
  it("loads the world topology over fetch", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(squareTopology) });
    await expect(loadWorld(fetchFn)).resolves.toEqual(squareTopology);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("countries-50m");
    const bad = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve(null) });
    await expect(loadWorld(bad)).rejects.toThrow("503");
  });
  it("defaults to the global fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(squareTopology) }),
    );
    await expect(loadWorld()).resolves.toEqual(squareTopology);
    vi.unstubAllGlobals();
  });

  it("inverts a projected point to lon/lat, or null when it cannot", () => {
    const frame = frameFor(GLOBAL);
    const centre = frame.projection([-150, 0]);
    if (centre === null) throw new Error("no centre");
    const back = invertPoint(frame.projection, centre);
    expect(back?.[0]).toBeCloseTo(-150, 5);
    expect(back?.[1]).toBeCloseTo(0, 5);
    const noInvert: GeoProjection = Object.assign(() => null, {
      invert: undefined,
    }) as unknown as GeoProjection;
    expect(invertPoint(noInvert, [1, 1])).toBeNull();
    const nullInvert = { invert: () => null } as unknown as GeoProjection;
    expect(invertPoint(nullInvert, [1, 1])).toBeNull();
    const nanInvert = { invert: () => [NaN, 0] } as unknown as GeoProjection;
    expect(invertPoint(nanInvert, [1, 1])).toBeNull();
    const nanLat = { invert: () => [0, NaN] } as unknown as GeoProjection;
    expect(invertPoint(nanLat, [1, 1])).toBeNull();
  });
});
