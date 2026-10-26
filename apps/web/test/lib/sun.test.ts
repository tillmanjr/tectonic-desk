import { describe, expect, it } from "vitest";
import { subsolarPoint, wrapLon } from "../../src/lib/sun.js";

describe("subsolarPoint", () => {
  it("puts the Sun over the tropic at the June solstice and near the equator at the equinox", () => {
    const [lonJune, latJune] = subsolarPoint(new Date("2026-06-21T12:00:00Z"));
    expect(latJune).toBeCloseTo(23.44, 1);
    // the equation of time is about -1.8 minutes, so the Sun is just east of Greenwich at noon
    expect(lonJune).toBeCloseTo(0.45, 0);
    const [lonMarch, latMarch] = subsolarPoint(new Date("2026-03-20T14:46:00Z"));
    expect(Math.abs(latMarch)).toBeLessThan(0.3);
    // 2 h 46 min past clock noon, less the 7.5-minute slow sundial of late March
    expect(lonMarch).toBeCloseTo(-39.6, 0);
  });

  it("gives the autumn declination and a western longitude when the sundial runs fast", () => {
    const [lon, lat] = subsolarPoint(new Date("2026-10-25T12:00:00Z"));
    expect(lat).toBeCloseTo(-12.3, 0);
    expect(lon).toBeCloseTo(-4, 0);
    const [midnight] = subsolarPoint(new Date("2026-10-25T00:00:00Z"));
    expect(Math.abs(midnight)).toBeGreaterThan(175);
  });

  it("wraps longitudes into (-180, 180]", () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(180)).toBe(180);
    expect(wrapLon(-180)).toBe(180);
    expect(wrapLon(540)).toBe(180);
    expect(wrapLon(0)).toBe(0);
  });
});
