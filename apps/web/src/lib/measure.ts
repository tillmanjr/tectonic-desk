import { angleBetween, EARTH_RADIUS_KM, type LonLat } from "@tectonic/shared";

/**
 * A two-point measurement on a spherical Earth of mean radius 6371 km: the great-circle
 * (surface) distance and angular distance Δ, and the straight chord through the interior with
 * how deep its midpoint dips and which PREM layer that depth falls in. The sphere puts the
 * surface distance within about 0.5 % of the WGS84 geodesic.
 */

export interface Measurement {
  /** Angular distance, degrees. */
  deltaDeg: number;
  surfaceKm: number;
  chordKm: number;
  /** Depth of the chord's midpoint below the surface, km. */
  dipKm: number;
  /** The PREM layer at that depth. */
  layer: string;
}

/** PREM's layers by the depth of their base, km (Dziewonski and Anderson 1981). */
export const PREM_LAYERS: readonly { base: number; name: string }[] = [
  { base: 24.4, name: "crust" },
  { base: 410, name: "upper mantle" },
  { base: 660, name: "transition zone" },
  { base: 2891, name: "lower mantle" },
  { base: 5150, name: "outer core" },
  { base: EARTH_RADIUS_KM, name: "inner core" },
];

/** The PREM layer a depth falls in; the deepest for anything past the centre. */
export function layerAt(depthKm: number): string {
  const found = PREM_LAYERS.find((l) => depthKm < l.base);
  return found === undefined ? "inner core" : found.name;
}

export function measureOf(a: LonLat, b: LonLat): Measurement {
  const theta = angleBetween(a, b);
  const dipKm = EARTH_RADIUS_KM * (1 - Math.cos(theta / 2));
  return {
    deltaDeg: (theta * 180) / Math.PI,
    surfaceKm: EARTH_RADIUS_KM * theta,
    chordKm: 2 * EARTH_RADIUS_KM * Math.sin(theta / 2),
    dipKm,
    layer: layerAt(dipKm),
  };
}

const km = (v: number): string =>
  v < 10 ? `${v.toFixed(1)} km` : `${Math.round(v).toLocaleString("en-US")} km`;

/** The label's two lines: the surface reading, then the chord's. */
export function measureLines(m: Measurement): [string, string] {
  return [
    `Δ ${m.deltaDeg.toFixed(2)}° · surface ${km(m.surfaceKm)}`,
    `chord ${km(m.chordKm)} · dips ${km(m.dipKm)}, ${m.layer}`,
  ];
}
