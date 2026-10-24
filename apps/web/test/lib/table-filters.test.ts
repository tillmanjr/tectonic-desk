import { describe, expect, it } from "vitest";
import {
  activeEventColumns,
  activeVolcanoColumns,
  applyEventTableFilter,
  applyVolcanoTableFilter,
  countriesOf,
  EMPTY_EVENT_TABLE_FILTER as EE,
  EMPTY_VOLCANO_TABLE_FILTER as EV,
} from "../../src/lib/table-filters.js";
import { event } from "../support/events.js";
import { volcano } from "../support/volcanoes.js";

const a = event({ id: "a", time: "2026-10-12T03:00:00Z", mag: 5.5, depthKm: 195 });
const b = event({ id: "b", time: "2026-10-11T23:30:00Z", mag: 6.1, depthKm: 10 });
const c = event({ id: "c", time: "2026-10-10T12:00:00Z", mag: null, depthKm: null });
const events = [a, b, c];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe("event table filter", () => {
  it("passes everything through untouched when nothing is set", () => {
    expect(applyEventTableFilter(events, EE, "utc")).toBe(events);
    expect(activeEventColumns(EE).size).toBe(0);
  });

  it("bounds magnitude and depth inclusively, dropping nulls once bounded", () => {
    expect(ids(applyEventTableFilter(events, { ...EE, minMag: 5.5 }, "utc"))).toEqual(["a", "b"]);
    expect(ids(applyEventTableFilter(events, { ...EE, maxMag: 5.5 }, "utc"))).toEqual(["a"]);
    expect(
      ids(applyEventTableFilter(events, { ...EE, minDepth: 10, maxDepth: 10 }, "utc")),
    ).toEqual(["b"]);
    expect(activeEventColumns({ ...EE, minMag: 1, maxMag: 2, minDepth: 3 })).toEqual(
      new Set(["mag", "depthKm"]),
    );
  });

  it("bounds time by calendar day in the zone, both ends inclusive", () => {
    expect(ids(applyEventTableFilter(events, { ...EE, since: "2026-10-12" }, "utc"))).toEqual([
      "a",
    ]);
    expect(ids(applyEventTableFilter(events, { ...EE, until: "2026-10-11" }, "utc"))).toEqual([
      "b",
      "c",
    ]);
    expect(
      ids(applyEventTableFilter(events, { ...EE, since: "2026-10-11", until: "2026-10-11" }, "utc")),
    ).toEqual(["b"]);
    // Local days follow the test machine's offset; the day holding b's local instant keeps it.
    const local = new Date("2026-10-11T23:30:00Z");
    const day = [
      String(local.getFullYear()),
      String(local.getMonth() + 1).padStart(2, "0"),
      String(local.getDate()).padStart(2, "0"),
    ].join("-");
    expect(
      ids(applyEventTableFilter(events, { ...EE, since: day, until: day }, "local")),
    ).toContain("b");
    expect(activeEventColumns({ ...EE, until: "2026-10-11" })).toEqual(new Set(["time"]));
  });
});

const etna = volcano();
const helens = volcano({
  number: 2,
  name: "St. Helens",
  country: "United States",
  elevationM: 2549,
  lastEruptionYear: 2008,
});
const field = volcano({
  number: 3,
  name: "Clear Lake",
  country: "United States",
  type: "Volcanic field",
  elevationM: null,
  lastEruptionYear: null,
});
const ancient = volcano({
  number: 4,
  name: "Ancient",
  country: "Atlantis",
  lastEruptionYear: -5000,
  elevationM: 10,
});
const vs = [etna, helens, field, ancient];
const names = (list: { name: string }[]) => list.map((v) => v.name);

describe("volcano table filter", () => {
  it("passes everything through untouched when nothing is set", () => {
    expect(applyVolcanoTableFilter(vs, EV)).toBe(vs);
    expect(activeVolcanoColumns(EV).size).toBe(0);
  });

  it("matches name case-insensitively, country and type exactly", () => {
    expect(names(applyVolcanoTableFilter(vs, { ...EV, name: "hELens" }))).toEqual(["St. Helens"]);
    expect(names(applyVolcanoTableFilter(vs, { ...EV, country: "United States" }))).toEqual([
      "St. Helens",
      "Clear Lake",
    ]);
    expect(names(applyVolcanoTableFilter(vs, { ...EV, type: "other" }))).toEqual(["Clear Lake"]);
    expect(
      names(applyVolcanoTableFilter(vs, { ...EV, type: "stratovolcano", country: "Italy" })),
    ).toEqual(["Etna"]);
  });

  it("bounds year and elevation, dropping unknowns once bounded", () => {
    expect(names(applyVolcanoTableFilter(vs, { ...EV, minYear: 2000 }))).toEqual([
      "Etna",
      "St. Helens",
    ]);
    expect(names(applyVolcanoTableFilter(vs, { ...EV, maxYear: -1000 }))).toEqual(["Ancient"]);
    expect(names(applyVolcanoTableFilter(vs, { ...EV, minElev: 11, maxElev: 3000 }))).toEqual([
      "St. Helens",
    ]);
    expect(activeVolcanoColumns({ ...EV, name: "x", minYear: 1, maxYear: 2, maxElev: 3 })).toEqual(
      new Set(["name", "last", "elevation"]),
    );
    expect(activeVolcanoColumns({ ...EV, country: "Italy", type: "shield" })).toEqual(
      new Set(["country", "type"]),
    );
  });

  it("lists countries once, sorted", () => {
    expect(countriesOf(vs)).toEqual(["Atlantis", "Italy", "United States"]);
  });
});
