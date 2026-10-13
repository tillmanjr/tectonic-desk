import type { Mechanism } from "../index.js";
import { planesFromAxes, type Axis, type NodalPlane } from "./planes.js";
import { axesFromTensor, tensorFromAxes, tensorFromPlane, type Tensor } from "./tensor.js";

/** The geometry fields shared by `Mechanism` and `ApiMechanism`. */
export type MechanismGeometry = Pick<
  Mechanism,
  | "strike1"
  | "dip1"
  | "rake1"
  | "strike2"
  | "dip2"
  | "rake2"
  | "tAzimuth"
  | "tPlunge"
  | "pAzimuth"
  | "pPlunge"
>;

export interface Axes {
  t: Axis;
  p: Axis;
}

export interface SolutionPlanes {
  planes: [NodalPlane, NodalPlane];
  /** True when the planes were derived from the T and P axes. */
  reconstructed: boolean;
}

export function storedAxes(m: MechanismGeometry): Axes | null {
  if (m.tAzimuth === null || m.tPlunge === null || m.pAzimuth === null || m.pPlunge === null) {
    return null;
  }
  return {
    t: { azimuth: m.tAzimuth, plunge: m.tPlunge },
    p: { azimuth: m.pAzimuth, plunge: m.pPlunge },
  };
}

export function storedPlanes(m: MechanismGeometry): [NodalPlane, NodalPlane] | null {
  if (
    m.strike1 === null ||
    m.dip1 === null ||
    m.rake1 === null ||
    m.strike2 === null ||
    m.dip2 === null ||
    m.rake2 === null
  ) {
    return null;
  }
  return [
    { strike: m.strike1, dip: m.dip1, rake: m.rake1 },
    { strike: m.strike2, dip: m.dip2, rake: m.rake2 },
  ];
}

/** Stored planes, else planes reconstructed from the axes, else null. */
export function planesOf(m: MechanismGeometry): SolutionPlanes | null {
  const planes = storedPlanes(m);
  if (planes) return { planes, reconstructed: false };
  const axes = storedAxes(m);
  if (axes === null) return null;
  return { planes: planesFromAxes(axes.t, axes.p), reconstructed: true };
}

/** Tensor from plane 1, else from the axes, else null. */
export function tensorOf(m: MechanismGeometry): Tensor | null {
  const planes = storedPlanes(m);
  if (planes) return tensorFromPlane(planes[0]);
  const axes = storedAxes(m);
  return axes === null ? null : tensorFromAxes(axes.t, axes.p);
}

/** Stored axes, else axes found on the tensor, else null. */
export function axesOf(m: MechanismGeometry): Axes | null {
  const axes = storedAxes(m);
  if (axes) return axes;
  const tensor = tensorOf(m);
  return tensor === null ? null : axesFromTensor(tensor);
}
