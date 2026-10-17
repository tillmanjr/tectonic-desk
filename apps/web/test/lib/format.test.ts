import { describe, expect, it } from "vitest";
import {
  ago,
  dateIn,
  offsetParts,
  offsetText,
  fmtClock,
  fmtCoord,
  fmtFloor,
  fmtInt,
  fmtMag,
  fmtMoment,
  fmtShort,
  fmtStamp,
  placeOf,
  zoneLabel,
} from "../../src/lib/format.js";

const iso = "2026-10-13T12:23:45.678Z";
const two = (n: number) => String(n).padStart(2, "0");
/** The same instant as the browser's zone sees it, built from Date itself so the test is zone-neutral. */
const local = new Date(iso);
const localDate = `${String(local.getFullYear())}-${two(local.getMonth() + 1)}-${two(local.getDate())}`;
const localTime = `${two(local.getHours())}:${two(local.getMinutes())}`;
const localAbbr = zoneLabel("local", local);

describe("zone-aware formatting", () => {
  it("labels zones", () => {
    expect(zoneLabel("utc", local)).toBe("UTC");
    expect(localAbbr).toMatch(/^[A-Z]{2,5}$|^GMT[+-]\d+$/);
  });
  it("formats stamps in UTC with every option", () => {
    expect(fmtStamp(iso, "utc")).toBe("2026-10-13 12:23 UTC");
    expect(fmtStamp(iso, "utc", { seconds: true })).toBe("2026-10-13 12:23:45 UTC");
    expect(fmtStamp(iso, "utc", { date: "monthday", label: false })).toBe("10-13 12:23");
  });
  it("formats stamps in the browser zone", () => {
    expect(fmtStamp(iso, "local")).toBe(`${localDate} ${localTime} ${localAbbr}`);
    expect(dateIn(iso, "local")).toBe(localDate);
    expect(fmtClock(iso, "local")).toBe(`${localTime} ${localAbbr}`);
  });
  it("formats short stamps, clocks and dates", () => {
    expect(fmtShort(iso, "utc")).toBe("Oct 13, 12:23 UTC");
    expect(fmtShort("2026-01-05T03:07:00Z", "utc")).toBe("Jan 5, 03:07 UTC");
    expect(fmtShort(iso, "local")).toContain(`, ${localTime} ${localAbbr}`);
    expect(fmtClock(iso, "utc")).toBe("12:23 UTC");
    expect(dateIn(iso, "utc")).toBe("2026-10-13");
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
    expect(fmtFloor(4.5)).toBe("M4.5+");
    expect(fmtFloor(6)).toBe("M6+");
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

describe("offsets", () => {
  const d = (s: string) => new Date(s);
  it("splits a calendar difference into whole units, borrowing a month when needed", () => {
    expect(offsetParts(d("2021-09-19T00:00Z"), d("2024-01-25T13:40Z"))).toEqual({
      years: 2,
      months: 4,
      days: 6,
      hours: 13,
      minutes: 40,
    });
    expect(offsetParts(d("2026-03-31T00:00Z"), d("2026-04-29T00:00Z")).months).toBe(0);
    expect(offsetParts(d("2026-04-29T00:00Z"), d("2026-03-31T00:00Z")).days).toBe(29);
  });
  it("renders the two largest units at the given precision", () => {
    expect(offsetText(d("2021-09-19T00:00Z"), d("2024-01-25T13:40Z"))).toBe("2 y 4 mo");
    expect(offsetText(d("2026-09-01T00:00Z"), d("2026-10-10T06:00Z"))).toBe("1 mo 9 d");
    expect(offsetText(d("2026-10-07T00:00Z"), d("2026-10-10T05:12Z"))).toBe("3 d 5 h");
    expect(offsetText(d("2026-10-10T00:00Z"), d("2026-10-10T05:12Z"))).toBe("5 h 12 min");
    expect(offsetText(d("2026-10-10T00:00Z"), d("2026-10-10T00:40Z"))).toBe("40 min");
    expect(offsetText(d("2026-10-10T00:00:00Z"), d("2026-10-10T00:00:30Z"))).toBe("< 1 min");
    expect(offsetText(d("2021-09-01T00:00Z"), d("2024-01-25T00:00Z"), "month")).toBe("2 y 4 mo");
    expect(offsetText(d("2026-10-01T00:00Z"), d("2026-10-20T00:00Z"), "month")).toBe("< 1 mo");
    expect(offsetText(d("1857-01-01T00:00Z"), d("2026-10-10T00:00Z"), "year")).toBe("169 y");
    expect(offsetText(d("2026-01-01T00:00Z"), d("2026-10-10T00:00Z"), "year")).toBe("< 1 y");
  });
});
