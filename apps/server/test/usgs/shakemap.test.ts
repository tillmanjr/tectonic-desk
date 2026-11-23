import { describe, expect, it } from "vitest";
import { detailDocumentSchema, type DetailDocument } from "../../src/usgs/schema.js";
import {
  COVERAGE_FILE,
  parseCoverage,
  pickShakeProduct,
  shakeMapOf,
} from "../../src/usgs/shakemap.js";
import { loadFixture } from "../support/fixtures.js";
import { z } from "zod";

const detail = loadFixture("shakemap_detail.json", detailDocumentSchema);
const coverage = loadFixture("shakemap_coverage.json", z.unknown());

function withShakemaps(products: unknown[]): DetailDocument {
  return { ...detail, properties: { ...detail.properties, products: { shakemap: products } } };
}
const product = (over: Record<string, unknown> = {}, props: Record<string, string> = {}) => ({
  source: "us",
  code: "us1",
  status: "UPDATE",
  updateTime: 1000,
  properties: { version: "2", "map-status": "reviewed", ...props },
  contents: { [COVERAGE_FILE]: { url: "https://usgs.test/cov.json" } },
  ...over,
});

describe("pickShakeProduct", () => {
  it("reads the fixture's ShakeMap: a NaN maximum becomes null", () => {
    const p = pickShakeProduct(detail);
    expect(p).toEqual({
      source: "us",
      version: 4,
      mapStatus: "automatic",
      processed: new Date("2026-11-01T20:20:52Z"),
      maxMmi: null,
      coverageUrl: expect.stringContaining("coverage_mmi_medium_res.covjson") as string,
    });
  });

  it("prefers the heaviest product, then the newest, and skips unusable ones", () => {
    const picked = pickShakeProduct(
      withShakemaps([
        { broken: true },
        product({ source: "nc", contents: {} }),
        product({ source: "old", preferredWeight: 10, updateTime: 1 }),
        product({ source: "new", preferredWeight: 10, updateTime: 2 }, { maxmmi: "6.3" }),
        product({ source: "light", preferredWeight: 1 }),
        product({ source: "none" }),
      ]),
    );
    expect(picked?.source).toBe("new");
    expect(picked?.maxMmi).toBe(6.3);
  });

  it("leaves absent properties null and answers null without a usable product", () => {
    const bare = pickShakeProduct(withShakemaps([product({ properties: {} })]));
    expect(bare).toMatchObject({ version: null, mapStatus: null, processed: null, maxMmi: null });
    expect(
      pickShakeProduct(withShakemaps([product({}, { "process-timestamp": "soon" })]))?.processed,
    ).toBeNull();
    expect(pickShakeProduct(withShakemaps([]))).toBeNull();
    expect(
      pickShakeProduct({ ...detail, properties: { ...detail.properties, products: undefined } }),
    ).toBeNull();
  });
});

describe("parseCoverage", () => {
  it("reads the fixture grid from its south-west corner, to a tenth", () => {
    const g = parseCoverage(coverage);
    expect(g.nx).toBe(11);
    expect(g.ny).toBe(11);
    expect(g.lon0).toBeCloseTo(-20.4667, 3);
    expect(g.lat0).toBeCloseTo(-1.8903, 3);
    expect(g.dLon).toBeCloseTo(0.2698, 3);
    expect(g.dLat).toBeCloseTo(0.2698, 3);
    expect(g.mmi).toHaveLength(121);
    expect(g.mmi.every((v) => v === null || Math.round(v * 10) === v * 10)).toBe(true);
    expect(Math.max(...g.mmi.map((v) => v ?? 0))).toBeGreaterThan(6);
  });

  const tiny = (x: [number, number], y: [number, number], values: (number | null)[]) => ({
    domain: {
      axes: { x: { start: x[0], stop: x[1], num: 2 }, y: { start: y[0], stop: y[1], num: 2 } },
    },
    ranges: { MMI: { axisNames: ["y", "x"], values } },
  });

  it("turns axes that run downwards so rows go south to north and columns west to east", () => {
    const g = parseCoverage(tiny([11, 10], [21, 20], [1, 2, 3.04, null]));
    expect(g).toEqual({ lon0: 10, lat0: 20, dLon: 1, dLat: 1, nx: 2, ny: 2, mmi: [null, 3, 2, 1] });
    expect(parseCoverage(tiny([10, 11], [20, 21], [1, 2, 3, 4])).mmi).toEqual([1, 2, 3, 4]);
  });

  it("rejects a grid its values do not fill, and other shapes", () => {
    expect(() => parseCoverage(tiny([10, 11], [20, 21], [1, 2, 3]))).toThrow(/3 values for 4/);
    expect(() =>
      parseCoverage({ ...tiny([10, 11], [20, 21], [1, 2, 3, 4]), ranges: {} }),
    ).toThrow();
  });
});

describe("shakeMapOf", () => {
  it("drops the coverage URL and adds the event and grid", () => {
    const p = pickShakeProduct(detail);
    if (p === null) throw new Error("no product");
    const grid = parseCoverage(coverage);
    const m = shakeMapOf("us6000u1z5", p, grid);
    expect(m).toEqual({
      eventId: "us6000u1z5",
      source: "us",
      version: 4,
      mapStatus: "automatic",
      processed: p.processed,
      maxMmi: null,
      grid,
    });
  });
});
