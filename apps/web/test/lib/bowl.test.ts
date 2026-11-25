import { tensorFromPlane, type Vec3 } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import {
  axisOnBowl,
  BOWL_DEPTH,
  BOWL_HOLD_MS,
  BOWL_SETTLE_MS,
  BOWL_TILT,
  bowlAt,
  bowlTexture,
  bowlView,
  depthAt,
  insideShade,
  onScreen,
  outsideShade,
  rasterBowl,
  rasterPlan,
} from "../../src/lib/bowl.js";
import { settleTilt } from "../../src/lib/bowl.js";

const RAD = Math.PI / 180;
/** A ray at inclination `inc` from vertical towards azimuth `az`, in [north, east, down]. */
const ray = (inc: number, az: number): Vec3 => [
  Math.sin(inc * RAD) * Math.cos(az * RAD),
  Math.sin(inc * RAD) * Math.sin(az * RAD),
  Math.cos(inc * RAD),
];
const thrust = tensorFromPlane({ strike: 320, dip: 22, rake: 95 });
const colors = { fill: [210, 68, 42], tension: [255, 255, 255], under: [185, 194, 201] } as const;

describe("settleTilt", () => {
  it("holds the opening tilt, eases through the middle and ends at the plan view", () => {
    expect(settleTilt(0)).toBe(BOWL_TILT);
    expect(settleTilt(BOWL_HOLD_MS)).toBe(BOWL_TILT);
    expect(settleTilt(BOWL_HOLD_MS + BOWL_SETTLE_MS / 2)).toBeCloseTo(BOWL_TILT / 2);
    expect(settleTilt(BOWL_HOLD_MS + BOWL_SETTLE_MS * 0.25)).toBeGreaterThan(BOWL_TILT / 2);
    expect(settleTilt(BOWL_HOLD_MS + BOWL_SETTLE_MS * 0.75)).toBeLessThan(BOWL_TILT / 2);
    expect(settleTilt(BOWL_HOLD_MS + BOWL_SETTLE_MS)).toBe(0);
    expect(settleTilt(1e6, -20)).toBe(-0);
  });
});

describe("shading", () => {
  it("lights the wall facing the light more than the floor and the wall in the rim's shadow", () => {
    // with the light under 45° the rim shades the floor too, as in a real hemispherical bowl
    expect(insideShade([0, 0, 1])).toBeLessThan(0.8);
    expect(insideShade(ray(60, 135))).toBeGreaterThan(1);
    // upper-left (north-west) wall: faces away from the light
    expect(insideShade(ray(89, 315))).toBeLessThan(0.6);
    // near the floor on the north-west side, the rim stands between the point and the light
    const shadowed = insideShade(ray(20, 315));
    const lit = insideShade(ray(60, 135));
    expect(shadowed).toBeLessThan(lit);
    expect(lit).toBeLessThanOrEqual(1.1);
  });
  it("shades the underside by its outward normal", () => {
    expect(outsideShade([0, 0, -1])).toBeCloseTo(0.7);
    expect(outsideShade(bowlAt(-0.7, 0.7).nIn)).toBeGreaterThan(0.7);
  });
});

describe("bowlAt", () => {
  it("puts the floor under the centre and the rim at zero depth, normals pointing in and up", () => {
    const c = bowlAt(0, 0);
    expect(c.p).toEqual([0, 0, BOWL_DEPTH]);
    expect(c.nIn[2]).toBeCloseTo(-1);
    const east = bowlAt(1, 0);
    expect(east.p[1]).toBe(1);
    expect(east.p[2]).toBeCloseTo(0);
    expect(east.v[1]).toBeCloseTo(1);
    expect(east.nIn[1]).toBeLessThan(0);
    expect(east.nIn[2]).toBeLessThan(0);
    // the ray is the equal-area plot's: radius √2 sin(i/2)
    const half = bowlAt(0, Math.SQRT2 * Math.sin(30 * RAD));
    expect(Math.acos(half.v[2]) / RAD).toBeCloseTo(60);
  });
});

describe("bowlView", () => {
  it("is the plan view at 0°, fitted to the rim radius", () => {
    const v = bowlView(0, 300, 147);
    expect(v.scale).toBe(147);
    const [x, y] = onScreen(v, [1, 0, 0]);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(3);
    expect(onScreen(v, bowlAt(0, 0).p)[1]).toBeCloseTo(150);
  });
  it("tilts from the south for positive angles and from the north for negative ones", () => {
    const south = bowlView(30, 300, 147);
    const north = bowlView(-30, 300, 147);
    expect(south.scale).toBeLessThanOrEqual(147);
    const floor = bowlAt(0, 0).p;
    const rimMiddle = 150;
    expect(onScreen(south, floor)[1]).toBeGreaterThan(onScreen(south, [0, 1, 0])[1]);
    expect(onScreen(north, floor)[1]).toBeLessThan(onScreen(north, [0, 1, 0])[1]);
    expect(onScreen(south, floor)[0]).toBeCloseTo(rimMiddle);
  });
});

describe("rasterisation", () => {
  it("samples the disc once, coloured by quadrant", () => {
    const tex = bowlTexture(thrust, 40, colors);
    expect(tex.length).toBeGreaterThan(1200);
    expect(tex.length).toBeLessThan(1300);
    expect(new Set(tex.map((s) => Math.round(s.inner[2]))).size).toBeGreaterThan(10);
  });
  it("draws the plan view with the underside hidden and the tilted view with it showing", () => {
    const n = 60;
    const tex = bowlTexture(thrust, 70, colors);
    const plan = new Uint8ClampedArray(n * n * 4);
    rasterBowl(plan, tex, bowlView(0, n, 27));
    const tilted = new Uint8ClampedArray(n * n * 4);
    const zbuf = rasterBowl(tilted, tex, bowlView(40, n, 27));
    // the underside's blue-grey is the only colour with red under green
    const under = (d: Uint8ClampedArray): number => {
      let k = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] === 255 && (d[i] ?? 0) < (d[i + 1] ?? 0)) k++;
      return k;
    };
    expect(under(plan)).toBe(0);
    expect(under(tilted)).toBeGreaterThan(0);
    expect(zbuf.some((z) => Number.isFinite(z))).toBe(true);
    expect(tilted[3]).toBe(0);
  });
  it("shades the equal-area plan pixel by pixel", () => {
    const n = 40;
    const data = new Uint8ClampedArray(n * n * 4);
    rasterPlan(data, n, 18, thrust, colors);
    expect(data[3]).toBe(0);
    const centre = (20 * n + 20) * 4;
    expect(data[centre + 3]).toBe(255);
    // a thrust has a compressional centre
    expect(data[centre] ?? 0).toBeGreaterThan(data[centre + 2] ?? 0);
  });
});

describe("depthAt", () => {
  it("reads the buffer, and treats a pixel off it as nothing drawn", () => {
    const z = new Float32Array([0.5, Infinity]);
    expect(depthAt(z, 0)).toBe(0.5);
    expect(depthAt(z, 1)).toBe(Infinity);
    expect(depthAt(z, 7)).toBe(Infinity);
  });
});

describe("axisOnBowl", () => {
  it("shows an axis on the far wall and hides one under the near rim", () => {
    const n = 60;
    const tex = bowlTexture(thrust, 70, colors);
    const view = bowlView(60, n, 27);
    const zbuf = rasterBowl(new Uint8ClampedArray(n * n * 4), tex, view);
    const far = axisOnBowl({ azimuth: 0, plunge: 20 }, view, zbuf);
    expect(far.visible).toBe(true);
    const near = axisOnBowl({ azimuth: 180, plunge: 3 }, view, zbuf);
    expect(near.visible).toBe(false);
    expect(near.y).toBeGreaterThan(far.y);
  });
});
