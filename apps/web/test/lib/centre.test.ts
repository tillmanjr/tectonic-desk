import { describe, expect, it } from "vitest";
import {
  centreQuery,
  DEFAULT_CENTRE,
  fmtLon,
  lonOfOffset,
  meridianLine,
  offsetOf,
  parseCentre,
  snapOffset,
  wrapLon,
} from "../../src/lib/centre.js";

describe("the global map's centre", () => {
  it("wraps longitudes into (−180, 180]", () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-180)).toBe(180);
    expect(wrapLon(540)).toBe(180);
    expect(wrapLon(-200)).toBe(160);
    expect(wrapLon(45)).toBe(45);
  });

  it("reads whole degrees from the route, the default for anything else", () => {
    expect(parseCentre(undefined)).toBe(DEFAULT_CENTRE);
    expect(parseCentre(["-30"])).toBe(DEFAULT_CENTRE);
    expect(parseCentre("-30")).toBe(-30);
    expect(parseCentre("-180")).toBe(180);
    expect(parseCentre("181")).toBe(DEFAULT_CENTRE);
    expect(parseCentre("12.5")).toBe(DEFAULT_CENTRE);
    expect(parseCentre("east")).toBe(DEFAULT_CENTRE);
    expect(centreQuery(DEFAULT_CENTRE)).toBeUndefined();
    expect(centreQuery(-30)).toBe("-30");
  });

  it("writes a longitude with its hemisphere", () => {
    expect(fmtLon(150)).toBe("150°E");
    expect(fmtLon(-30)).toBe("30°W");
    expect(fmtLon(0)).toBe("0°");
    expect(fmtLon(180)).toBe("180°");
  });

  it("runs the slider either side of the default, catching drags near it", () => {
    expect(offsetOf(DEFAULT_CENTRE)).toBe(0);
    expect(offsetOf(-30)).toBe(180);
    expect(offsetOf(0)).toBe(-150);
    expect(lonOfOffset(0)).toBe(DEFAULT_CENTRE);
    expect(lonOfOffset(180)).toBe(-30);
    expect(lonOfOffset(-150)).toBe(0);
    expect(snapOffset(4)).toBe(0);
    expect(snapOffset(-5)).toBe(0);
    expect(snapOffset(6)).toBe(6);
  });

  it("draws a meridian pole to pole", () => {
    const m = meridianLine(-30);
    expect(m.coordinates).toHaveLength(37);
    expect(m.coordinates[0]).toEqual([-30, -90]);
    expect(m.coordinates[36]).toEqual([-30, 90]);
  });
});
