import type { BBox } from "@tectonic/shared";

export interface Window {
  from: Date;
  to: Date;
}

/** Months from here on, years before: PDE-era volumes need monthly pages, earlier decades do not. */
export const MONTHLY_FROM = Date.UTC(1970, 0, 1);

/** UTC midnight on the first of a month; safe for years below 100, unlike Date.UTC. */
function utcStart(year: number, month: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month, 1);
  return d;
}

/** The canonical window containing `t`. */
export function windowAt(t: Date): Window {
  const y = t.getUTCFullYear();
  if (t.getTime() >= MONTHLY_FROM) {
    const m = t.getUTCMonth();
    return { from: utcStart(y, m), to: utcStart(y, m + 1) };
  }
  return { from: utcStart(y, 0), to: utcStart(y + 1, 0) };
}

/** Every canonical window intersecting the half-open range, newest first. */
export function windowsBetween(from: Date, to: Date): Window[] {
  const out: Window[] = [];
  if (to.getTime() <= from.getTime()) return out;
  let w = windowAt(new Date(to.getTime() - 1));
  while (w.to.getTime() > from.getTime()) {
    out.push(w);
    w = windowAt(new Date(w.from.getTime() - 1));
  }
  return out;
}

/** `minLon,minLat,maxLon,maxLat` as the API spells it; null for a global scope. */
export const bboxKey = (bbox: BBox | undefined): string | null =>
  bbox === undefined ? null : [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].join(",");
