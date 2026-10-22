import { describe, expect, it } from "vitest";
import type { Mark } from "../../src/lib/marks.js";
import {
  captionOf,
  coarser,
  compareTitle,
  matrixWidthPx,
  pairCell,
  pointOf,
} from "../../src/lib/matrix.js";
import type { EruptionAnchor } from "../../src/lib/volcanoes.js";

const quake: Mark = {
  id: "a",
  kind: "event",
  ref: "us1",
  name: "A",
  url: "/",
  frame: "world",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "x",
  stamp: "2026-10-13T10:00:00.000Z",
  mag: 5.5,
  depthKm: 10,
  createdAt: "2026-10-21T00:00:00.000Z",
};
const other: Mark = {
  ...quake,
  id: "b",
  lon: -121,
  lat: 37,
  stamp: "2026-10-16T13:30:00.000Z",
  mag: 4.7,
  depthKm: 34.4,
};
const etna: Mark = {
  ...quake,
  id: "c",
  kind: "volcano",
  ref: "211060",
  lon: 15,
  lat: 37.75,
  stamp: null,
  mag: null,
  depthKm: null,
};
const anchor: EruptionAnchor = {
  date: new Date("2022-11-27T00:00:00Z"),
  precision: "year",
  continuing: true,
  label: "2022",
};

describe("matrix", () => {
  it("picks the coarser precision", () => {
    expect(coarser("day", "month")).toBe("month");
    expect(coarser("year", "day")).toBe("year");
    expect(coarser("day", "day")).toBe("day");
  });

  it("resolves each mark's instant", () => {
    expect(pointOf(quake, () => null).when).toEqual({
      date: new Date("2026-10-13T10:00:00.000Z"),
      precision: "day",
    });
    expect(pointOf({ ...quake, stamp: null }, () => null).when).toBeNull();
    expect(pointOf(etna, () => null).when).toBeNull();
    expect(pointOf(etna, (n) => (n === 211060 ? anchor : null)).when).toEqual({
      date: anchor.date,
      precision: "year",
    });
  });

  it("compares two earthquakes, an earthquake and a volcano, and undated pairs", () => {
    const a = pointOf(quake, () => null);
    const b = pointOf(other, () => null);
    const two = pairCell(a, b);
    expect(two.time).toBe("3 d 3 h");
    expect(two.dMag).toBeCloseTo(0.8, 5);
    expect(two.dDepth).toBeCloseTo(24.4, 5);
    expect(two.km).toBeGreaterThan(85);
    expect(two.km).toBeLessThan(95);
    const v = pointOf(etna, () => anchor);
    const mixed = pairCell(a, v);
    expect(mixed.time).toBe("3 y");
    expect(mixed.dMag).toBeNull();
    expect(mixed.dDepth).toBeNull();
    expect(mixed.km).toBeGreaterThan(9000);
    expect(
      pairCell(
        a,
        pointOf(etna, () => null),
      ).time,
    ).toBeNull();
    expect(
      pairCell(
        a,
        pointOf({ ...other, mag: null, depthKm: null }, () => null),
      ),
    ).toMatchObject({
      dMag: null,
      dDepth: null,
    });
  });

  it("captions an axis with the origin, magnitude and depth, the onset at its precision, or the lack of one", () => {
    expect(
      captionOf(
        pointOf(quake, () => null),
        "utc",
      ),
    ).toBe("2026-10-13 10:00 UTC · M5.5 · 10 km");
    expect(
      captionOf(
        pointOf({ ...quake, depthKm: null }, () => null),
        "utc",
      ),
    ).toBe("2026-10-13 10:00 UTC · M5.5");
    expect(
      captionOf(
        pointOf(etna, () => anchor),
        "utc",
      ),
    ).toBe("onset 2022");
    expect(
      captionOf(
        pointOf(etna, () => ({ ...anchor, precision: "month" })),
        "utc",
      ),
    ).toBe("onset 2022-11");
    expect(
      captionOf(
        pointOf(etna, () => ({ ...anchor, precision: "day" })),
        "utc",
      ),
    ).toBe("onset 2022-11-27");
    expect(
      captionOf(
        pointOf(etna, () => null),
        "utc",
      ),
    ).toBe("no dated eruption");
  });

  it("sizes the grid and words the Compare tooltip", () => {
    expect(matrixWidthPx(3)).toBe(649);
    expect(compareTitle(1, 5000)).toBe("Mark at least two events to compare them");
    expect(compareTitle(3, 700)).toBe("Compare 3 events pairwise");
    expect(compareTitle(8, 700)).toBe(
      "Compare 8 events pairwise · about 1,384 px wide, wider than this window; the grid will scroll sideways",
    );
  });
});
