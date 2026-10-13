const RAD = Math.PI / 180;

export interface Axis {
  /** Degrees clockwise from north. */
  azimuth: number;
  /** Degrees below horizontal. */
  plunge: number;
}

export interface NodalPlane {
  strike: number;
  dip: number;
  rake: number;
}

type Vec3 = [number, number, number];

/** Unit vector in the north-east-down frame. */
function axisVector(a: Axis): Vec3 {
  const az = a.azimuth * RAD;
  const pl = a.plunge * RAD;
  return [Math.cos(pl) * Math.cos(az), Math.cos(pl) * Math.sin(az), Math.sin(pl)];
}

/** Strike, dip and rake of the plane with normal `n` and slip `d` (Aki & Richards). */
function planeFrom(normal: Vec3, slip: Vec3): NodalPlane {
  let n = normal;
  let d = slip;
  if (n[2] > 0) {
    n = [-n[0], -n[1], -n[2]];
    d = [-d[0], -d[1], -d[2]];
  }
  const dip = Math.acos(-n[2]);
  let strike = Math.atan2(-n[0], n[1]);
  if (strike < 0) strike += 2 * Math.PI;
  const sl = -d[2] / Math.sin(dip);
  const cl = d[0] * Math.cos(strike) + d[1] * Math.sin(strike);
  return { strike: strike / RAD, dip: dip / RAD, rake: Math.atan2(sl, cl) / RAD };
}

/**
 * Both nodal planes of a double couple from its T (tension) and P (pressure)
 * axes. Normal and slip are n = (T + P) / sqrt2 and d = (T - P) / sqrt2; the
 * auxiliary plane swaps them. Ported from the verified prototype math.
 */
export function planesFromAxes(t: Axis, p: Axis): [NodalPlane, NodalPlane] {
  const tv = axisVector(t);
  const pv = axisVector(p);
  const n: Vec3 = [
    (tv[0] + pv[0]) / Math.SQRT2,
    (tv[1] + pv[1]) / Math.SQRT2,
    (tv[2] + pv[2]) / Math.SQRT2,
  ];
  const d: Vec3 = [
    (tv[0] - pv[0]) / Math.SQRT2,
    (tv[1] - pv[1]) / Math.SQRT2,
    (tv[2] - pv[2]) / Math.SQRT2,
  ];
  return [planeFrom(n, d), planeFrom(d, n)];
}
