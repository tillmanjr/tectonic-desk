import { fmtInt, fmtMag, fmtStamp, offsetText, type DatePrecision, type Zone } from "./format.js";
import type { Mark } from "./marks.js";
import { distanceKm } from "./sequence.js";
import type { EruptionAnchor } from "./volcanoes.js";

/** A mark with the instant it is compared at: an earthquake's origin, a volcano's latest eruption onset. */
export interface MarkPoint {
  mark: Mark;
  when: { date: Date; precision: DatePrecision } | null;
}

/** What one cell of the comparison matrix says about a pair. */
export interface PairCell {
  /** Time apart in the two largest units at the coarser precision; null when either side is undated. */
  time: string | null;
  /** Magnitude difference; only between two earthquakes that both carry a magnitude. */
  dMag: number | null;
  /** Depth difference in km; only between two earthquakes that both carry a depth. */
  dDepth: number | null;
  /** Great-circle distance in km. */
  km: number;
}

const RANK: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 };
/** The coarser of two precisions, which is what a difference can honestly be stated at. */
export const coarser = (a: DatePrecision, b: DatePrecision): DatePrecision =>
  RANK[a] >= RANK[b] ? a : b;

/** Resolves a mark's instant; volcanoes ask `anchorFor` for their eruption onset. */
export function pointOf(
  mark: Mark,
  anchorFor: (number: number) => EruptionAnchor | null,
): MarkPoint {
  if (mark.kind === "event") {
    return {
      mark,
      when: mark.stamp === null ? null : { date: new Date(mark.stamp), precision: "day" },
    };
  }
  const a = anchorFor(Number(mark.ref));
  return { mark, when: a === null ? null : { date: a.date, precision: a.precision } };
}

const diff = (x: number | null, y: number | null): number | null =>
  x === null || y === null ? null : Math.abs(x - y);

/** The comparison of two points. Symmetric: every difference is an absolute value. */
export function pairCell(a: MarkPoint, b: MarkPoint): PairCell {
  const quakes = a.mark.kind === "event" && b.mark.kind === "event";
  return {
    time:
      a.when === null || b.when === null
        ? null
        : offsetText(a.when.date, b.when.date, coarser(a.when.precision, b.when.precision)),
    dMag: quakes ? diff(a.mark.mag, b.mark.mag) : null,
    dDepth: quakes ? diff(a.mark.depthKm, b.mark.depthKm) : null,
    km: distanceKm(
      { latitude: a.mark.lat, longitude: a.mark.lon },
      { latitude: b.mark.lat, longitude: b.mark.lon },
    ),
  };
}

const DIGITS: Record<DatePrecision, number> = { day: 10, month: 7, year: 4 };

/** The axis caption under a mark's name: origin time, magnitude and depth; or the eruption onset; or that it has none. */
export function captionOf(p: MarkPoint, zone: Zone): string {
  if (p.when === null) return "no dated eruption";
  if (p.mark.kind !== "event") {
    return `onset ${p.when.date.toISOString().slice(0, DIGITS[p.when.precision])}`;
  }
  const depth = p.mark.depthKm === null ? "" : ` · ${String(Math.round(p.mark.depthKm))} km`;
  return `${fmtStamp(p.when.date.toISOString(), zone)} · M${fmtMag(p.mark.mag)}${depth}`;
}

/** The grid's row header and one column, in CSS pixels, as `styles.css` sizes them. */
export const ROW_HEADER_PX = 208;
export const COL_PX = 147;
export const matrixWidthPx = (n: number): number => ROW_HEADER_PX + n * COL_PX;

/** The Compare button's tooltip: what it compares, and a warning when the grid will overflow the given width. */
export function compareTitle(n: number, availablePx: number): string {
  if (n < 2) return "Mark at least two events to compare them";
  const head = `Compare ${String(n)} events pairwise`;
  const w = matrixWidthPx(n);
  return w > availablePx
    ? `${head} · about ${fmtInt(w)} px wide, wider than this window; the grid will scroll sideways`
    : head;
}
