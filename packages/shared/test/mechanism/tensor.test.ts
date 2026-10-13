import { describe, expect, it } from "vitest";
import {
  axesFromTensor,
  axisVector,
  directionAt,
  projectAxis,
  radiation,
  tensorFromAxes,
  tensorFromPlane,
  type Tensor,
} from "../../src/index.js";

/** Reference events from the prototype catalog (US moment tensors, 2026-10). */
export const REF = [
  {
    id: "us6000u1pl",
    plane: { strike: 12.67, dip: 68.63, rake: -126.14 },
    t: { azimuth: 128, plunge: 16 },
    p: { azimuth: 240, plunge: 52 },
  },
  {
    id: "us6000u1kv",
    plane: { strike: 136.47, dip: 54.94, rake: 109.13 },
    t: { azimuth: 96, plunge: 72 },
    p: { azimuth: 213, plunge: 8 },
  },
  {
    id: "us6000u1gs",
    plane: { strike: 346.44, dip: 36.02, rake: -56.11 },
    t: { azimuth: 233, plunge: 13 },
    p: { azimuth: 355, plunge: 67 },
  },
  {
    id: "us6000u1ex",
    plane: { strike: 270.06, dip: 88.67, rake: -2.21 },
    t: { azimuth: 315, plunge: 1 },
    p: { azimuth: 225, plunge: 3 },
  },
];

function maxDiff(a: Tensor, b: Tensor): number {
  let m = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) m = Math.max(m, Math.abs(a[i][j] - b[i][j]));
  }
  return m;
}

describe("tensorFromPlane vs tensorFromAxes", () => {
  it.each(REF)("$id agrees within 0.03", ({ plane, t, p }) => {
    expect(maxDiff(tensorFromPlane(plane), tensorFromAxes(t, p))).toBeLessThan(0.03);
  });
  it("is symmetric and traceless", () => {
    const m = tensorFromPlane({ strike: 30, dip: 60, rake: 45 });
    expect(m[0][1]).toBe(m[1][0]);
    expect(m[0][2]).toBe(m[2][0]);
    expect(m[1][2]).toBe(m[2][1]);
    expect(Math.abs(m[0][0] + m[1][1] + m[2][2])).toBeLessThan(1e-12);
  });
});

describe("radiation", () => {
  it("is positive along T and negative along P", () => {
    const m = tensorFromAxes({ azimuth: 128, plunge: 16 }, { azimuth: 240, plunge: 52 });
    expect(radiation(m, axisVector({ azimuth: 128, plunge: 16 }))).toBeCloseTo(1, 3);
    expect(radiation(m, axisVector({ azimuth: 240, plunge: 52 }))).toBeCloseTo(-1, 3);
  });
});

describe("axesFromTensor", () => {
  function dot(a: { azimuth: number; plunge: number }, b: { azimuth: number; plunge: number }) {
    const u = axisVector(a);
    const v = axisVector(b);
    return Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
  }
  it.each(REF)("$id recovers the published axes within 3°", ({ plane, t, p }) => {
    const ax = axesFromTensor(tensorFromPlane(plane));
    expect(dot(ax.t, t)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
    expect(dot(ax.p, p)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
  });
});

describe("directionAt", () => {
  it("maps the centre to vertical and the rim to horizontal", () => {
    expect(directionAt(0, 0)).toEqual([0, 0, 1]);
    const east = directionAt(1, 0);
    expect(east).not.toBeNull();
    if (east) {
      expect(east[0]).toBeCloseTo(0, 6);
      expect(east[1]).toBeCloseTo(1, 6);
      expect(east[2]).toBeCloseTo(0, 6);
    }
  });
  it("is null outside the unit disc", () => {
    expect(directionAt(0.8, 0.8)).toBeNull();
  });
});

describe("projectAxis", () => {
  it("puts a vertical axis at the centre and a horizontal north axis on the rim", () => {
    const [cx, cy] = projectAxis({ azimuth: 45, plunge: 90 });
    expect(cx).toBeCloseTo(0, 6);
    expect(cy).toBeCloseTo(0, 6);
    const [nx, ny] = projectAxis({ azimuth: 0, plunge: 0 });
    expect(nx).toBeCloseTo(0, 6);
    expect(ny).toBeCloseTo(1, 6);
  });
  it("round-trips through directionAt", () => {
    const a = { azimuth: 128, plunge: 16 };
    const [x, y] = projectAxis(a);
    const v = directionAt(x, y);
    const u = axisVector(a);
    expect(v).not.toBeNull();
    if (v) for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(u[i], 6);
  });
});
