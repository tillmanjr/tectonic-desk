import { describe, expect, it } from "vitest";
import {
  aroundZero,
  CADENCE_MS,
  decadeTicks,
  flareBands,
  fmtDecade,
  gapMs,
  kpBars,
  linePath,
  nearestIndex,
  ROWS,
  spanAtLeast,
  spanWithZero,
  viewX,
  xrayTickLabel,
} from "../../src/lib/space-chart.js";
import { flare } from "../support/space.js";

describe("domains and ticks", () => {
  it("builds the row domains from the data with their floors", () => {
    expect(aroundZero([-2, 3], 5)).toEqual([-5, 5]);
    expect(aroundZero([-12, 3], 5)).toEqual([-12, 12]);
    expect(spanWithZero([-5, -40], 20)).toEqual([-60, 20]);
    expect(spanWithZero([100, 400], 20)).toEqual([-40, 440]);
    expect(spanAtLeast([350, 420], 300, 500)).toEqual([290, 510]);
    expect(spanAtLeast([250, 700], 300, 500)).toEqual([227.5, 722.5]);
    const byId = Object.fromEntries(ROWS.map((r) => [r.id, r]));
    expect(byId.kp?.domain([7])).toEqual([0, 9]);
    expect(byId.xray?.domain([1])).toEqual([1e-9, 1e-3]);
    expect(byId.protons?.domain([0.3])).toEqual([1e-2, 1e3]);
    expect(byId.protons?.domain([800])).toEqual([1e-2, 1600]);
    const density = byId.wind?.right?.domain([3, 12]) ?? [0, 0];
    expect(density[0]).toBeCloseTo(-0.6, 9);
    expect(density[1]).toBeCloseTo(12.6, 9);
    expect(byId.dst?.domain([-35])).toEqual([-55, 20]);
    expect(byId.mag?.domain([-6.2, 9.8])).toEqual([-9.8, 9.8]);
    expect(byId.power?.domain([12, 21])).toEqual([-2, 42]);
    expect(byId.power?.domain([30, 95])).toEqual([-4.75, 99.75]);
    expect(ROWS.map((r) => r.id)).toEqual(["kp", "dst", "power", "mag", "wind", "xray", "protons"]);
    expect(byId.xray?.ticks?.(1e-9, 1e-3)).toEqual([1e-7, 1e-6, 1e-5, 1e-4]);
    expect(byId.protons?.ticks?.(1e-2, 1600)).toEqual([1, 10, 100, 1000]);
    expect(ROWS.filter((r) => r.scale === "linear").every((r) => r.ticks === null)).toBe(true);
  });

  it("labels decades, with GOES letters on the X-ray axis", () => {
    expect(fmtDecade(1e-5)).toBe("10⁻⁵");
    expect(fmtDecade(1000)).toBe("10³");
    expect(fmtDecade(1)).toBe("10⁰");
    expect(decadeTicks(1e-9, 1e-3)).toEqual([1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3]);
    expect(decadeTicks(0.02, 1600)).toEqual([0.1, 1, 10, 100, 1000]);
    expect([1e-8, 1e-7, 1e-6, 1e-5, 1e-4].map(xrayTickLabel)).toEqual(["A", "B", "C", "M", "X"]);
    expect(xrayTickLabel(1e-9)).toBe("10⁻⁹");
    expect(xrayTickLabel(1e-3)).toBe("10⁻³");
  });
});

describe("lines, bars and bands", () => {
  const x = (ms: number): number => ms / 60_000;
  const y = (v: number): number => (v > 0 ? 100 - v : Number.NaN);

  it("draws a line that lifts across gaps and unplaceable points", () => {
    expect(linePath([], x, y, 1)).toBe("");
    const pts: [number, number][] = [
      [0, 10],
      [60_000, 20],
      [120_000, 0],
      [180_000, 30],
      [600_000, 40],
      [660_000, 50],
    ];
    expect(linePath(pts, x, y, 3 * 60_000)).toBe("M0.0,90.0L1.0,80.0M3.0,70.0M10.0,60.0L11.0,50.0");
    expect(gapMs("kp_1m", null)).toBe(3 * 60_000);
    expect(gapMs("kp_1m", 420)).toBe(3 * 420_000);
    expect(gapMs("kp_3h", 420)).toBe(9 * 3_600_000);
    expect(Object.keys(CADENCE_MS)).toHaveLength(13);
  });

  it("maps a pointer to viewBox units against its element, or null without one", () => {
    const rect = (left: number, width: number): DOMRect =>
      ({
        left,
        width,
        top: 0,
        height: 0,
        right: left + width,
        bottom: 0,
        x: left,
        y: 0,
      }) as DOMRect;
    const el = document.createElement("div");
    el.getBoundingClientRect = () => rect(100, 450);
    expect(viewX({ clientX: 325, currentTarget: el }, 900)).toBe(450);
    expect(viewX({ clientX: 325, currentTarget: null }, 900)).toBeNull();
    const flat = document.createElement("div");
    flat.getBoundingClientRect = () => rect(0, 0);
    expect(viewX({ clientX: 3, currentTarget: flat }, 900)).toBe(2700);
  });

  it("finds the nearest point by time", () => {
    const pts: [number, number][] = [
      [0, 1],
      [100, 2],
      [200, 3],
      [300, 4],
    ];
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex(pts, -50)).toBe(0);
    expect(nearestIndex(pts, 0)).toBe(0);
    expect(nearestIndex(pts, 149)).toBe(1);
    expect(nearestIndex(pts, 151)).toBe(2);
    expect(nearestIndex(pts, 250)).toBe(3);
    expect(nearestIndex(pts, 900)).toBe(3);
  });

  it("turns flares into bands, an open one running to now", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    const bands = flareBands(
      [
        flare(),
        flare({ beginTime: "2026-10-13T11:40:00.000Z", endTime: null, maxClass: null }),
        flare({
          beginTime: "2026-10-13T11:50:00.000Z",
          endTime: null,
          maxClass: null,
          beginClass: null,
        }),
      ],
      now,
    );
    expect(bands[0]).toEqual({
      key: "2026-10-13T10:30:00.000Z",
      startMs: Date.parse("2026-10-13T10:30:00Z"),
      endMs: Date.parse("2026-10-13T11:10:00Z"),
      label: "M1.3",
    });
    expect(bands[1]).toMatchObject({ endMs: now, label: "C2.1" });
    expect(bands[2]?.label).toBe("flare");
  });

  it("lays 3-hour Kp bars to the next window, coloured by G level", () => {
    const h = 3_600_000;
    const bars = kpBars(
      [
        [0, 2.33],
        [3 * h, 5],
      ],
      (ms) => ms / h,
      (v) => 90 - v * 10,
      90,
    );
    expect(bars).toEqual([
      { key: 0, x: 0, w: 2, y: 66.7, h: expect.closeTo(23.3, 6) as number, level: 0 },
      { key: 3 * h, x: 3, w: 2, y: 40, h: 50, level: 1 },
    ]);
    expect(
      kpBars(
        [[0, 1]],
        () => 5,
        () => 80,
        90,
      )[0]?.w,
    ).toBe(1);
  });
});
