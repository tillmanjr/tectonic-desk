import type { Axis, NodalPlane } from "./planes.js";

const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];
/** Symmetric 3×3 tensor in the north-east-down frame, unit scalar moment. */
export type Tensor = [Vec3, Vec3, Vec3];

/** Unit vector in the north-east-down frame. */
export function axisVector(a: Axis): Vec3 {
  const az = a.azimuth * RAD;
  const pl = a.plunge * RAD;
  return [Math.cos(pl) * Math.cos(az), Math.cos(pl) * Math.sin(az), Math.sin(pl)];
}

/** Double-couple tensor from strike, dip and rake (Aki & Richards, NED). */
export function tensorFromPlane(p: NodalPlane): Tensor {
  const s = p.strike * RAD;
  const d = p.dip * RAD;
  const r = p.rake * RAD;
  const sd = Math.sin(d);
  const cd = Math.cos(d);
  const s2d = Math.sin(2 * d);
  const c2d = Math.cos(2 * d);
  const sr = Math.sin(r);
  const cr = Math.cos(r);
  const ss = Math.sin(s);
  const cs = Math.cos(s);
  const s2s = Math.sin(2 * s);
  const c2s = Math.cos(2 * s);
  const xx = -(sd * cr * s2s + s2d * sr * ss * ss);
  const xy = sd * cr * c2s + 0.5 * s2d * sr * s2s;
  const xz = -(cd * cr * cs + c2d * sr * ss);
  const yy = sd * cr * s2s - s2d * sr * cs * cs;
  const yz = -(cd * cr * ss - c2d * sr * cs);
  const zz = s2d * sr;
  return [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
}

/** Double-couple tensor T⊗T − P⊗P from the tension and pressure axes. */
export function tensorFromAxes(t: Axis, p: Axis): Tensor {
  const tv = axisVector(t);
  const pv = axisVector(p);
  const e = (i: 0 | 1 | 2, j: 0 | 1 | 2): number => tv[i] * tv[j] - pv[i] * pv[j];
  return [
    [e(0, 0), e(0, 1), e(0, 2)],
    [e(1, 0), e(1, 1), e(1, 2)],
    [e(2, 0), e(2, 1), e(2, 2)],
  ];
}

/** vᵀMv: positive in compressional quadrants, negative in dilatational ones. */
export function radiation(m: Tensor, v: Vec3): number {
  const [a, b, c] = v;
  return (
    a * (m[0][0] * a + m[0][1] * b + m[0][2] * c) +
    b * (m[1][0] * a + m[1][1] * b + m[1][2] * c) +
    c * (m[2][0] * a + m[2][1] * b + m[2][2] * c)
  );
}

/** T and P axes of a tensor by a 2° grid search over the lower hemisphere. */
export function axesFromTensor(m: Tensor): { t: Axis; p: Axis } {
  let t: Axis = { azimuth: 0, plunge: 0 };
  let p: Axis = { azimuth: 0, plunge: 0 };
  let tMax = -Infinity;
  let pMin = Infinity;
  for (let az = 0; az < 360; az += 2) {
    for (let pl = 0; pl <= 90; pl += 2) {
      const a = { azimuth: az, plunge: pl };
      const r = radiation(m, axisVector(a));
      if (r > tMax) {
        tMax = r;
        t = a;
      }
      if (r < pMin) {
        pMin = r;
        p = a;
      }
    }
  }
  return { t, p };
}

/**
 * Lower-hemisphere equal-area inverse projection: the unit direction (NED)
 * plotted at (x east, y north) in the unit disc, or null outside the disc.
 */
export function directionAt(x: number, y: number): Vec3 | null {
  const rr = x * x + y * y;
  if (rr > 1) return null;
  const inc = 2 * Math.asin(Math.sqrt(rr) / Math.SQRT2);
  const az = Math.atan2(x, y);
  return [Math.sin(inc) * Math.cos(az), Math.sin(inc) * Math.sin(az), Math.cos(inc)];
}

/** Where an axis plots in the unit disc, as [east, north]. */
export function projectAxis(a: Axis): [number, number] {
  const inc = (90 - a.plunge) * RAD;
  const r = Math.SQRT2 * Math.sin(inc / 2);
  const az = a.azimuth * RAD;
  return [r * Math.sin(az), r * Math.cos(az)];
}
