import { describe, expect, it } from "vitest";
import {
  applyFilter,
  CATALOG_START,
  dateBoundsFor,
  dayEnd,
  dayStart,
  EMPTY_FILTER,
  filterQuery,
  hasRange,
  isActive,
  parseBound,
  parseDate,
  parseFilter,
  rangeInstants,
  resolveDates,
  spanStart,
} from "../../src/lib/filters.js";
import { event } from "../support/events.js";

const evs = [
  event({ id: "a", mag: 4.5, depthKm: 10 }),
  event({ id: "b", mag: 5.0, depthKm: 70 }),
  event({ id: "c", mag: 6.5, depthKm: 300 }),
  event({ id: "n", mag: null, depthKm: null }),
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);
const bounds = { min: CATALOG_START, max: "2026-10-13" };
const now = new Date("2026-10-13T12:00:00Z");

describe("parseBound / parseDate", () => {
  it("accepts finite numbers and rejects everything else", () => {
    expect(parseBound("5")).toBe(5);
    expect(parseBound("-1.5")).toBe(-1.5);
    expect(parseBound(" ")).toBeNull();
    expect(parseBound("abc")).toBeNull();
    expect(parseBound("Infinity")).toBeNull();
    expect(parseBound(undefined)).toBeNull();
    expect(parseBound(["5"])).toBeNull();
  });
  it("accepts real calendar dates only", () => {
    expect(parseDate("2026-10-13")).toBe("2026-10-13");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("13/10/2026")).toBeNull();
    expect(parseDate(7)).toBeNull();
  });
});

describe("parseFilter", () => {
  it("clamps the magnitude minimum to the floor and leaves the rest alone", () => {
    expect(
      parseFilter({ minMag: "3", maxMag: "6", minDepth: "0", maxDepth: "70" }, 4.5, bounds),
    ).toEqual({ ...EMPTY_FILTER, minMag: 4.5, maxMag: 6, minDepth: 0, maxDepth: 70 });
    expect(parseFilter({ minMag: "5.5" }, 4.5, bounds).minMag).toBe(5.5);
    expect(parseFilter({}, 4.5, bounds)).toEqual(EMPTY_FILTER);
  });
  it("keeps dates inside the bounds and ordered", () => {
    expect(parseFilter({ since: "1899-12-31", until: "2027-01-01" }, 4.5, bounds)).toMatchObject({
      since: "1900-01-01",
      until: "2026-10-13",
    });
    expect(parseFilter({ since: "2026-10-10", until: "2026-10-01" }, 4.5, bounds)).toMatchObject({
      since: "2026-10-10",
      until: "2026-10-10",
    });
    expect(parseFilter({ since: "2026-08-01" }, 4.5, bounds)).toMatchObject({
      since: "2026-08-01",
      until: null,
    });
    expect(parseFilter({ until: "nope" }, 4.5, bounds).until).toBeNull();
  });
});

describe("filterQuery / isActive / hasRange", () => {
  it("serialises set bounds only", () => {
    expect(filterQuery(EMPTY_FILTER)).toEqual({
      minMag: undefined,
      maxMag: undefined,
      minDepth: undefined,
      maxDepth: undefined,
      since: undefined,
      until: undefined,
    });
    expect(filterQuery({ ...EMPTY_FILTER, minMag: 5, maxDepth: 70, since: "2026-10-01" })).toEqual({
      minMag: "5",
      maxMag: undefined,
      minDepth: undefined,
      maxDepth: "70",
      since: "2026-10-01",
      until: undefined,
    });
    expect(isActive(EMPTY_FILTER)).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, maxDepth: 1 })).toBe(true);
    expect(hasRange({ ...EMPTY_FILTER, maxDepth: 1 })).toBe(false);
    expect(hasRange({ ...EMPTY_FILTER, until: "2026-10-01" })).toBe(true);
  });
});

describe("applyFilter", () => {
  it("returns the input untouched when no number bound is set", () => {
    expect(applyFilter(evs, EMPTY_FILTER)).toBe(evs);
    expect(applyFilter(evs, { ...EMPTY_FILTER, since: "2026-10-01" })).toBe(evs);
  });
  it("applies each bound inclusively, alone or together", () => {
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minMag: 5 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxMag: 5 }))).toEqual(["a", "b"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minMag: 5, maxMag: 6.5 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: 70 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxDepth: 70 }))).toEqual(["a", "b"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: 11, maxDepth: 299 }))).toEqual(["b"]);
    expect(
      ids(applyFilter(evs, { ...EMPTY_FILTER, minMag: 5, maxMag: 6, minDepth: 0, maxDepth: 100 })),
    ).toEqual(["b"]);
  });
  it("drops events missing the filtered value, and keeps them when that filter is open", () => {
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxMag: 9 }))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: -5 }))).toEqual(["a", "b", "c"]);
  });
});

describe("dates and ranges", () => {
  it("bounds the selectable dates to the catalogue start and today", () => {
    expect(dateBoundsFor(now, "utc")).toEqual(bounds);
  });
  it("finds a span's start day, clamped to the catalogue start", () => {
    expect(spanStart("2026-10-13", 30)).toBe("2026-09-13");
    expect(spanStart("2026-10-13", 365)).toBe("2025-10-13");
    expect(spanStart("2026-03-01", 1)).toBe("2026-02-28");
    expect(spanStart("1900-02-01", 90)).toBe(CATALOG_START);
    expect(spanStart("2026-10-13", null)).toBe(CATALOG_START);
  });
  it("finds day starts and ends in UTC and in the browser zone", () => {
    expect(dayStart("2026-10-13", "utc").toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(dayEnd("2026-10-13", "utc").toISOString()).toBe("2026-10-13T23:59:59.999Z");
    const s = dayStart("2026-10-13", "local");
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 9, 13, 0]);
    const e = dayEnd("2026-10-13", "local");
    expect([e.getDate(), e.getHours(), e.getMinutes(), e.getMilliseconds()]).toEqual([
      13, 23, 59, 999,
    ]);
    expect(e.getTime() - s.getTime()).toBeGreaterThan(22 * 36e5);
  });
  it("resolves the queried days: explicit bounds, else the last thirty days up to today", () => {
    expect(resolveDates(EMPTY_FILTER, now, "utc")).toEqual({
      since: "2026-09-13",
      until: "2026-10-13",
    });
    expect(resolveDates({ ...EMPTY_FILTER, since: "2026-10-01" }, now, "utc")).toEqual({
      since: "2026-10-01",
      until: "2026-10-13",
    });
    expect(resolveDates({ ...EMPTY_FILTER, until: "2026-10-10" }, now, "utc")).toEqual({
      since: "2026-09-13",
      until: "2026-10-10",
    });
    expect(resolveDates({ ...EMPTY_FILTER, until: "2026-09-01" }, now, "utc")).toEqual({
      since: "2026-09-01",
      until: "2026-09-01",
    });
    expect(
      resolveDates({ ...EMPTY_FILTER, since: "2026-10-01", until: "2026-10-05" }, now, "utc"),
    ).toEqual({ since: "2026-10-01", until: "2026-10-05" });
  });
  it("turns a day span into server instants", () => {
    expect(rangeInstants({ since: "2026-10-01", until: "2026-10-05" }, "utc")).toEqual({
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-05T23:59:59.999Z",
    });
  });
});
