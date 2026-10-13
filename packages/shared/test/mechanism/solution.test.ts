import { describe, expect, it } from "vitest";
import {
  axesOf,
  planesOf,
  storedAxes,
  storedPlanes,
  tensorFromAxes,
  tensorOf,
  type MechanismGeometry,
} from "../../src/index.js";

const full: MechanismGeometry = {
  strike1: 12.67,
  dip1: 68.63,
  rake1: -126.14,
  strike2: 256.15,
  dip2: 41.23,
  rake2: -33.56,
  tAzimuth: 128,
  tPlunge: 16,
  pAzimuth: 240,
  pPlunge: 52,
};
const axesOnly: MechanismGeometry = {
  ...full,
  strike1: null,
  dip1: null,
  rake1: null,
  strike2: null,
  dip2: null,
  rake2: null,
};
const planesOnly: MechanismGeometry = {
  ...full,
  tAzimuth: null,
  tPlunge: null,
  pAzimuth: null,
  pPlunge: null,
};
const empty: MechanismGeometry = {
  ...axesOnly,
  tAzimuth: null,
  tPlunge: null,
  pAzimuth: null,
  pPlunge: null,
};

const PLANE_FIELDS = ["strike1", "dip1", "rake1", "strike2", "dip2", "rake2"] as const;
const AXIS_FIELDS = ["tAzimuth", "tPlunge", "pAzimuth", "pPlunge"] as const;

describe("storedPlanes / storedAxes", () => {
  it("need every field", () => {
    expect(storedPlanes(full)).toEqual([
      { strike: 12.67, dip: 68.63, rake: -126.14 },
      { strike: 256.15, dip: 41.23, rake: -33.56 },
    ]);
    for (const f of PLANE_FIELDS) expect(storedPlanes({ ...full, [f]: null })).toBeNull();
    expect(storedAxes(full)).toEqual({
      t: { azimuth: 128, plunge: 16 },
      p: { azimuth: 240, plunge: 52 },
    });
    for (const f of AXIS_FIELDS) expect(storedAxes({ ...full, [f]: null })).toBeNull();
  });
});

describe("planesOf", () => {
  it("returns stored planes unflagged", () => {
    expect(planesOf(full)).toEqual({ planes: storedPlanes(full), reconstructed: false });
  });
  it("reconstructs from axes and flags it", () => {
    const r = planesOf(axesOnly);
    expect(r?.reconstructed).toBe(true);
    const strikes = (r?.planes ?? []).map((p) => p.strike).sort((a, b) => a - b);
    expect(strikes[0]).toBeCloseTo(12.67, 0);
    expect(strikes[1]).toBeCloseTo(256.15, 0);
  });
  it("is null without planes or axes", () => {
    expect(planesOf(empty)).toBeNull();
  });
});

describe("tensorOf / axesOf", () => {
  it("prefers planes, then axes, then nothing", () => {
    expect(tensorOf(full)).toEqual(tensorOf(planesOnly));
    expect(tensorOf(axesOnly)).toEqual(
      tensorFromAxes({ azimuth: 128, plunge: 16 }, { azimuth: 240, plunge: 52 }),
    );
    expect(tensorOf(empty)).toBeNull();
  });
  it("returns stored axes, else searches the tensor, else null", () => {
    expect(axesOf(full)).toEqual({
      t: { azimuth: 128, plunge: 16 },
      p: { azimuth: 240, plunge: 52 },
    });
    const searched = axesOf(planesOnly);
    expect(searched).not.toBeNull();
    expect(Math.abs((searched?.t.plunge ?? 0) - 16)).toBeLessThanOrEqual(3);
    expect(axesOf(empty)).toBeNull();
  });
});
