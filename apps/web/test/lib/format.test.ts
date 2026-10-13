import { describe, expect, it } from "vitest";
import {
  ago,
  fmtCoord,
  fmtInt,
  fmtLocal,
  fmtMag,
  fmtMoment,
  fmtUtc,
  fmtUtcShort,
  fmtUtcTime,
  placeOf,
} from "../../src/lib/format.js";

const iso = "2026-10-13T12:23:45.678Z";

describe("time formatting", () => {
  it("formats UTC to the minute or second", () => {
    expect(fmtUtc(iso)).toBe("2026-10-13 12:23");
    expect(fmtUtc(iso, true)).toBe("2026-10-13 12:23:45");
    expect(fmtUtcTime(iso)).toBe("12:23");
    expect(fmtUtcShort(iso)).toBe("Oct 13, 12:23 UTC");
    expect(fmtUtcShort("2026-01-05T03:07:00Z")).toBe("Jan 5, 03:07 UTC");
  });
  it("formats local time with a zone abbreviation", () => {
    expect(fmtLocal(iso, "America/Los_Angeles")).toBe("Oct 13, 5:23 AM PDT");
    expect(fmtLocal(iso)).toMatch(/Oct 13, \d{1,2}:23 [AP]M/);
  });
  it("describes elapsed time in minutes, hours or days", () => {
    const now = new Date("2026-10-13T13:00:00Z");
    expect(ago("2026-10-13T12:59:50Z", now)).toBe("1 min");
    expect(ago("2026-10-13T12:30:00Z", now)).toBe("30 min");
    expect(ago("2026-10-13T10:30:00Z", now)).toBe("2.5 h");
    expect(ago("2026-10-13T01:00:00Z", now)).toBe("12 h");
    expect(ago("2026-10-10T13:00:00Z", now)).toBe("3.0 d");
  });
});

describe("numbers and places", () => {
  it("formats magnitudes", () => {
    expect(fmtMag(null)).toBe("—");
    expect(fmtMag(6.94)).toBe("6.9");
    expect(fmtMag(6.9, true)).toBe("6.9");
    expect(fmtMag(5.55, true)).toBe("5.55");
  });
  it("splits a scalar moment into mantissa and exponent", () => {
    expect(fmtMoment(null)).toBeNull();
    expect(fmtMoment(1.9e17)).toEqual({ mantissa: "1.90", exponent: 17 });
  });
  it("formats coordinates and integers", () => {
    expect(fmtCoord(-18.723, -175.1452)).toBe("18.723°S, 175.145°W");
    expect(fmtCoord(42.5006, 144.2781)).toBe("42.501°N, 144.278°E");
    expect(fmtInt(7269)).toBe("7,269");
  });
  it("placeOf falls back for a missing place", () => {
    expect(placeOf({ place: "Tonga" })).toBe("Tonga");
    expect(placeOf({ place: null })).toBe("unknown location");
  });
});
