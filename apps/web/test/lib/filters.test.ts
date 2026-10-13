import { describe, expect, it } from "vitest";
import {
  applyFilter,
  EMPTY_FILTER,
  filterQuery,
  isActive,
  parseBound,
  parseFilter,
} from "../../src/lib/filters.js";
import { event } from "../support/events.js";

const evs = [
  event({ id: "a", mag: 4.5, depthKm: 10 }),
  event({ id: "b", mag: 5.0, depthKm: 70 }),
  event({ id: "c", mag: 6.5, depthKm: 300 }),
  event({ id: "n", mag: null, depthKm: null }),
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe("parseBound / parseFilter", () => {
  it("accepts finite numbers and rejects everything else", () => {
    expect(parseBound("5")).toBe(5);
    expect(parseBound("-1.5")).toBe(-1.5);
    expect(parseBound(" ")).toBeNull();
    expect(parseBound("abc")).toBeNull();
    expect(parseBound("Infinity")).toBeNull();
    expect(parseBound(undefined)).toBeNull();
    expect(parseBound(["5"])).toBeNull();
  });
  it("clamps the magnitude minimum to the floor and leaves the rest alone", () => {
    expect(parseFilter({ minMag: "3", maxMag: "6", minDepth: "0", maxDepth: "70" }, 4.5)).toEqual({
      minMag: 4.5,
      maxMag: 6,
      minDepth: 0,
      maxDepth: 70,
    });
    expect(parseFilter({ minMag: "5.5" }, 4.5).minMag).toBe(5.5);
    expect(parseFilter({}, 4.5)).toEqual(EMPTY_FILTER);
  });
});

describe("filterQuery / isActive", () => {
  it("serialises set bounds only", () => {
    expect(filterQuery(EMPTY_FILTER)).toEqual({
      minMag: undefined,
      maxMag: undefined,
      minDepth: undefined,
      maxDepth: undefined,
    });
    expect(filterQuery({ minMag: 5, maxMag: null, minDepth: null, maxDepth: 70 })).toEqual({
      minMag: "5",
      maxMag: undefined,
      minDepth: undefined,
      maxDepth: "70",
    });
    expect(isActive(EMPTY_FILTER)).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, maxDepth: 1 })).toBe(true);
  });
});

describe("applyFilter", () => {
  it("returns the input untouched when nothing is set", () => {
    expect(applyFilter(evs, EMPTY_FILTER)).toBe(evs);
  });
  it("applies each bound inclusively, alone or together", () => {
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minMag: 5 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxMag: 5 }))).toEqual(["a", "b"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minMag: 5, maxMag: 6.5 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: 70 }))).toEqual(["b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxDepth: 70 }))).toEqual(["a", "b"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: 11, maxDepth: 299 }))).toEqual(["b"]);
    expect(ids(applyFilter(evs, { minMag: 5, maxMag: 6, minDepth: 0, maxDepth: 100 }))).toEqual([
      "b",
    ]);
  });
  it("drops events missing the filtered value, and keeps them when that filter is open", () => {
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, maxMag: 9 }))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilter(evs, { ...EMPTY_FILTER, minDepth: -5 }))).toEqual(["a", "b", "c"]);
  });
});
