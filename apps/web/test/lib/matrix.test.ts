import { describe, expect, it } from "vitest";
import type { Mark } from "../../src/lib/marks.js";
import {
  cardOf,
  coarser,
  compareTitle,
  fmtSigned,
  kmText,
  matrixWidthPx,
  nodeLines,
  pointOf,
  signedOffset,
  staircase,
  whenText,
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
const none = (): null => null;

describe("matrix", () => {
  it("picks the coarser precision and signs numbers", () => {
    expect(coarser("day", "month")).toBe("month");
    expect(coarser("year", "day")).toBe("year");
    expect(coarser("day", "day")).toBe("day");
    expect(fmtSigned(0.6, 1)).toBe("+0.6");
    expect(fmtSigned(-68, 0)).toBe("−68");
    expect(fmtSigned(0, 1)).toBe("0.0");
  });

  it("resolves each mark's instant", () => {
    expect(pointOf(quake, none).when).toEqual({
      date: new Date("2026-10-13T10:00:00.000Z"),
      precision: "day",
    });
    expect(pointOf({ ...quake, stamp: null }, none).when).toBeNull();
    expect(pointOf(etna, none).when).toBeNull();
    expect(pointOf(etna, (n) => (n === 211060 ? anchor : null)).when).toEqual({
      date: anchor.date,
      precision: "year",
    });
  });

  it("states the top mark's time relative to the left mark's", () => {
    const a = pointOf(quake, none);
    const b = pointOf(other, none);
    expect(signedOffset(a, b)).toBe("+3 d 3 h");
    expect(signedOffset(b, a)).toBe("−3 d 3 h");
    expect(signedOffset(a, a)).toBe("same time");
    expect(
      signedOffset(
        a,
        pointOf(etna, () => anchor),
      ),
    ).toBe("−3 y");
    expect(signedOffset(a, pointOf(etna, none))).toBe("—");
  });

  it("writes node lines and card values", () => {
    expect(nodeLines(pointOf(quake, none), "utc")).toEqual([
      "2026-10-13 10:00 UTC",
      "M5.5",
      "10 km deep",
    ]);
    expect(nodeLines(pointOf({ ...quake, depthKm: null }, none), "utc")).toEqual([
      "2026-10-13 10:00 UTC",
      "M5.5",
    ]);
    expect(
      nodeLines(
        pointOf(etna, () => anchor),
        "utc",
      ),
    ).toEqual(["onset 2022"]);
    expect(
      nodeLines(
        pointOf(etna, () => ({ ...anchor, precision: "month" })),
        "utc",
      ),
    ).toEqual(["onset 2022-11"]);
    expect(
      nodeLines(
        pointOf(etna, () => ({ ...anchor, precision: "day" })),
        "utc",
      ),
    ).toEqual(["onset 2022-11-27"]);
    expect(nodeLines(pointOf(etna, none), "utc")).toEqual(["no dated eruption"]);
    expect(whenText(pointOf(etna, none), "utc", false)).toBe("—");
    expect(
      whenText(
        pointOf(etna, () => anchor),
        "utc",
        false,
      ),
    ).toBe("2022");
  });

  it("builds a card from the left mark to the top mark", () => {
    const card = cardOf(pointOf(other, none), pointOf(quake, none), "utc");
    expect(card.rows).toEqual([
      { label: "time", left: "2026-10-16 13:30", delta: "−3 d 3 h", top: "2026-10-13 10:00" },
      { label: "M", left: "4.7", delta: "+0.8", top: "5.5" },
      { label: "depth", left: "34 km", delta: "−24 km", top: "10 km" },
    ]);
    expect(card.km).toBeGreaterThan(85);
    expect(card.km).toBeLessThan(95);
    expect(kmText(card.km)).toBe("89 km apart");
    const mixed = cardOf(
      pointOf(quake, none),
      pointOf(etna, () => anchor),
      "utc",
    );
    expect(mixed.rows[0]).toEqual({
      label: "time",
      left: "2026-10-13 10:00",
      delta: "−3 y",
      top: "2022",
    });
    expect(mixed.rows[1]).toEqual({ label: "M", left: "5.5", delta: "—", top: "—" });
    expect(mixed.rows[2]).toEqual({ label: "depth", left: "10 km", delta: "—", top: "—" });
    expect(mixed.km).toBeGreaterThan(9000);
    const bare = cardOf(
      pointOf({ ...other, mag: null, depthKm: null }, none),
      pointOf(quake, none),
      "utc",
    );
    expect(bare.rows[1]).toMatchObject({ left: "—", delta: "—", top: "5.5" });
  });

  it("lays points out as a staircase with the fullest column on the left", () => {
    const pts = [quake, other, etna].map((m) => pointOf(m, none));
    const g = staircase(pts, "utc");
    expect(g.cols.map((p) => p.mark.id)).toEqual(["a", "b"]);
    expect(g.rows.map((r) => r.p.mark.id)).toEqual(["b", "c"]);
    expect(g.rows.map((r) => r.cells.map((c) => c !== null))).toEqual([
      [true, false],
      [true, true],
    ]);
    expect(g.rows[0]?.cells[0]?.rows[1]?.delta).toBe("+0.8");
    expect(staircase([], "utc")).toEqual({ cols: [], rows: [] });
  });

  it("sizes the grid and words the Compare tooltip", () => {
    expect(matrixWidthPx(3)).toBe(732);
    expect(compareTitle(1, 5000)).toBe("Mark at least two events to compare them");
    expect(compareTitle(3, 800)).toBe("Compare 3 events pairwise");
    expect(compareTitle(8, 800)).toBe(
      "Compare 8 events pairwise · about 2,012 px wide, wider than this window; the grid will scroll sideways",
    );
  });
});
