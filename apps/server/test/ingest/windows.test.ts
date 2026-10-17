import { describe, expect, it } from "vitest";
import { bboxKey, windowAt, windowsBetween } from "../../src/ingest/windows.js";

const d = (s: string) => new Date(s);
const iso = (w: { from: Date; to: Date } | undefined) =>
  w === undefined ? [] : [w.from.toISOString(), w.to.toISOString()];

describe("windows", () => {
  it("uses calendar months from 1970 and calendar years before", () => {
    expect(iso(windowAt(d("2026-10-17T12:00:00Z")))).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("1969-12-31T23:59:59Z")))).toEqual([
      "1969-01-01T00:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("1970-01-01T00:00:00Z")))).toEqual([
      "1970-01-01T00:00:00.000Z",
      "1970-02-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("0050-06-01T00:00:00Z")))).toEqual([
      "0050-01-01T00:00:00.000Z",
      "0051-01-01T00:00:00.000Z",
    ]);
  });

  it("lists whole windows intersecting the range, newest first, across the 1970 boundary", () => {
    const w = windowsBetween(d("1968-06-15T00:00:00Z"), d("1971-02-10T00:00:00Z"));
    expect(w).toHaveLength(16);
    expect(iso(w[0])).toEqual(["1971-02-01T00:00:00.000Z", "1971-03-01T00:00:00.000Z"]);
    expect(w[2]?.from.toISOString()).toBe("1970-12-01T00:00:00.000Z");
    expect(w[13]?.from.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(iso(w[15])).toEqual(["1968-01-01T00:00:00.000Z", "1969-01-01T00:00:00.000Z"]);
  });

  it("treats the range as half-open and returns nothing for an empty range", () => {
    expect(windowsBetween(d("2020-01-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toHaveLength(1);
    expect(windowsBetween(d("2020-02-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toEqual([]);
    expect(windowsBetween(d("2020-03-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toEqual([]);
  });

  it("formats a bbox key the way the API spells it", () => {
    expect(bboxKey(undefined)).toBeNull();
    expect(bboxKey({ minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 })).toBe("-136,27,-104,53");
  });
});
