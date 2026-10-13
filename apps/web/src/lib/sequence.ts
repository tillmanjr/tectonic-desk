import type { ApiEvent } from "@tectonic/shared";

const RAD = Math.PI / 180;
const SEQUENCE_KM = 150;
const MAINSHOCK_MAG = 6.5;

interface LatLon {
  latitude: number;
  longitude: number;
}

/** Great-circle distance by the spherical law of cosines, R = 6371 km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const p1 = a.latitude * RAD;
  const p2 = b.latitude * RAD;
  const dl = (b.longitude - a.longitude) * RAD;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return 6371 * Math.acos(Math.min(1, c));
}

/** A mainshock's followers. Only returned when there is at least one. */
export interface Sequence {
  count: number;
  largest: ApiEvent;
  spanHours: number;
}

const t = (e: ApiEvent): number => Date.parse(e.time);
const magOf = (e: ApiEvent): number => e.mag ?? -Infinity;

/** The M6.5+ event this one follows within 150 km, if any. */
export function parentOf(e: ApiEvent, list: ApiEvent[]): ApiEvent | null {
  return (
    list.find((o) => magOf(o) >= MAINSHOCK_MAG && t(o) < t(e) && distanceKm(o, e) <= SEQUENCE_KM) ??
    null
  );
}

/**
 * Later events within 150 km of an M6.5+ mainshock that is not itself inside
 * another sequence; null when the event is not a mainshock or has no followers.
 */
export function sequenceOf(e: ApiEvent, list: ApiEvent[], now: Date): Sequence | null {
  if (magOf(e) < MAINSHOCK_MAG || parentOf(e, list) !== null) return null;
  const after = list.filter((o) => t(o) > t(e) && distanceKm(e, o) <= SEQUENCE_KM);
  const first = after[0];
  if (first === undefined) return null;
  const largest = after.reduce((a, o) => (magOf(o) > magOf(a) ? o : a), first);
  return { count: after.length, largest, spanHours: (now.getTime() - t(e)) / 36e5 };
}
