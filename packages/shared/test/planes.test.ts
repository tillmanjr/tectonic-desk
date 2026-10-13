import { describe, expect, it } from "vitest";
import { planesFromAxes, type NodalPlane } from "../src/index.js";

const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

function expectPublished(planes: [NodalPlane, NodalPlane], published: NodalPlane[]) {
  for (const p of published) {
    const hit = planes.some(
      (x) => close(x.strike, p.strike) && close(x.dip, p.dip) && close(x.rake, p.rake),
    );
    expect(hit, JSON.stringify({ p, planes })).toBe(true);
  }
}

describe("planesFromAxes", () => {
  it("reproduces USGS planes for us6000u1z5 (strike-slip, Mid-Atlantic Ridge)", () => {
    expectPublished(planesFromAxes({ azimuth: 34, plunge: 7 }, { azimuth: 126, plunge: 14 }), [
      { strike: 169.26, dip: 74.94, rake: -5.12 },
      { strike: 260.59, dip: 85.06, rake: -164.88 },
    ]);
  });

  it("reproduces USGS planes for us6000u1pl (normal faulting, Tonga)", () => {
    expectPublished(planesFromAxes({ azimuth: 128, plunge: 16 }, { azimuth: 240, plunge: 52 }), [
      { strike: 12.67, dip: 68.63, rake: -126.14 },
      { strike: 256.15, dip: 41.23, rake: -33.56 },
    ]);
  });

  it("keeps strike in [0, 360) and dip in [0, 90]", () => {
    const cases: [number, number, number, number][] = [
      [300, 80, 120, 10],
      [10, 0, 100, 0],
      [200, 45, 20, 45],
      [0, 90, 90, 0],
    ];
    for (const [ta, tp, pa, pp] of cases) {
      for (const pl of planesFromAxes({ azimuth: ta, plunge: tp }, { azimuth: pa, plunge: pp })) {
        expect(pl.strike).toBeGreaterThanOrEqual(0);
        expect(pl.strike).toBeLessThan(360);
        expect(pl.dip).toBeGreaterThanOrEqual(0);
        expect(pl.dip).toBeLessThanOrEqual(90);
        expect(Number.isFinite(pl.rake)).toBe(true);
      }
    }
  });
});
