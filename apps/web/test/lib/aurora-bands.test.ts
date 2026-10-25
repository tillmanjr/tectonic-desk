import { AURORA_CELLS, AURORA_THRESHOLDS, auroraIndex } from "@tectonic/shared";
import { geoArea, geoContains } from "d3-geo";
import { describe, expect, it } from "vitest";
import { auroraBands } from "../../src/lib/aurora-bands.js";
import { capGrid, ringGrid } from "../support/aurora.js";

const positions = (band: ReturnType<typeof auroraBands>[number]) => band.coordinates.flat(2);

describe("auroraBands", () => {
  it("contours a ring grid into bands that contain the oval and not the pole", () => {
    const bands = auroraBands(ringGrid());
    expect(bands).toHaveLength(AURORA_THRESHOLDS.length);
    const [ten, thirty, fifty, seventy, ninety] = bands;
    expect(ten?.coordinates.length).toBeGreaterThan(0);
    expect(fifty?.coordinates.length).toBeGreaterThan(0);
    // 80 % on the centre line, 95 in the midnight sector: a 90 band exists only there
    expect(ninety?.coordinates.length).toBeGreaterThan(0);
    expect(seventy?.coordinates.length).toBeGreaterThan(0);
    if (ten === undefined || thirty === undefined || ninety === undefined) throw new Error("bands");
    for (const [lon = NaN, lat = NaN] of positions(ten)) {
      expect(lon).toBeGreaterThan(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(89.9);
    }
    // the oval is in the 10 band, the pole and the equator are not
    expect(geoContains(ten, [0, 67])).toBe(true);
    expect(geoContains(ten, [0, -67])).toBe(true);
    expect(geoContains(ten, [0, 89])).toBe(false);
    expect(geoContains(ten, [0, 0])).toBe(false);
    // the 30 band is narrower than the 10 band
    expect(geoContains(thirty, [120, 67])).toBe(true);
    expect(geoContains(thirty, [120, 69.6])).toBe(false);
    expect(geoContains(ten, [120, 69.6])).toBe(true);
    // the midnight sector alone reaches 90
    expect(geoContains(ninety, [180, 67])).toBe(true);
    expect(geoContains(ninety, [0, 67])).toBe(false);
    // no band covers more than a hemisphere
    for (const band of bands) expect(geoArea(band)).toBeLessThan(2 * Math.PI);
  });

  it("keeps a polar cap a cap by pulling the pole row in to 89.9°", () => {
    const [ten, , fifty] = auroraBands(capGrid(80, 60));
    if (ten === undefined || fifty === undefined) throw new Error("bands");
    expect(fifty.coordinates.length).toBeGreaterThan(0);
    const lats = positions(fifty).map(([, lat]) => Math.abs(lat ?? 0));
    expect(Math.max(...lats)).toBe(89.9);
    expect(geoContains(fifty, [45, 85])).toBe(true);
    expect(geoContains(fifty, [45, -85])).toBe(true);
    expect(geoContains(fifty, [45, 70])).toBe(false);
    expect(geoArea(fifty)).toBeLessThan(Math.PI);
    expect(geoContains(ten, [45, 85])).toBe(true);
  });

  it("answers empty bands for an empty or short grid", () => {
    for (const band of auroraBands(new Uint8Array(AURORA_CELLS)))
      expect(band.coordinates).toEqual([]);
    const short = new Uint8Array(10);
    short[auroraIndex(0, -90)] = 100;
    expect(auroraBands(short)[0]?.coordinates.length).toBe(1);
  });
});
