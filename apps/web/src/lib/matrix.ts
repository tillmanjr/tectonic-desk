import { fmtInt, fmtMag, fmtStamp, offsetText, type DatePrecision, type Zone } from "./format.js";
import type { Mark } from "./marks.js";
import { distanceKm } from "./sequence.js";
import type { EruptionAnchor } from "./volcanoes.js";

/** A mark with the instant it is compared at: an earthquake's origin, a volcano's latest eruption onset. */
export interface MarkPoint {
  mark: Mark;
  when: { date: Date; precision: DatePrecision } | null;
}

/** One line of an edge card: the left mark's value, the change from left to top, the top mark's value. */
export interface CardRow {
  label: string;
  left: string;
  delta: string;
  top: string;
}

/** An edge card: three rows (time, M, depth) and the distance, read from the left mark to the top one. */
export interface Card {
  rows: CardRow[];
  km: number;
}

/** The staircase: columns are all marks but the last, rows all but the first; a cell exists where the row mark comes later in the group. */
export interface Staircase {
  cols: MarkPoint[];
  rows: { p: MarkPoint; cells: (Card | null)[] }[];
}

const RANK: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 };
/** The coarser of two precisions, which is what a difference can honestly be stated at. */
export const coarser = (a: DatePrecision, b: DatePrecision): DatePrecision =>
  RANK[a] >= RANK[b] ? a : b;
const DIGITS: Record<DatePrecision, number> = { day: 10, month: 7, year: 4 };
const DASH = "—";
const MINUS = "−";

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

/** A signed number for a delta column: `+0.6`, `−68`, or `0` without a sign. */
export function fmtSigned(n: number, digits: number): string {
  const abs = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${abs}` : n < 0 ? `${MINUS}${abs}` : abs;
}

/** The top mark's time relative to the left mark's: `+1 d 6 h` later, `−4 h 32 min` earlier, `same time`. */
export function signedOffset(from: MarkPoint, to: MarkPoint): string {
  if (from.when === null || to.when === null) return DASH;
  const ms = to.when.date.getTime() - from.when.date.getTime();
  if (ms === 0) return "same time";
  const text = offsetText(
    from.when.date,
    to.when.date,
    coarser(from.when.precision, to.when.precision),
  );
  return `${ms > 0 ? "+" : MINUS}${text}`;
}

/** A point's instant as a node line or a card value: the origin time, or the onset at its precision. */
export function whenText(p: MarkPoint, zone: Zone, label = true): string {
  if (p.when === null) return label ? "no dated eruption" : DASH;
  if (p.mark.kind === "event") return fmtStamp(p.when.date.toISOString(), zone, { label });
  return `${label ? "onset " : ""}${p.when.date.toISOString().slice(0, DIGITS[p.when.precision])}`;
}

/** The lines under a node's name: time, magnitude and depth for an earthquake; the onset for a volcano. */
export function nodeLines(p: MarkPoint, zone: Zone): string[] {
  const lines = [whenText(p, zone)];
  if (p.mark.kind !== "event") return lines;
  lines.push(`M${fmtMag(p.mark.mag)}`);
  if (p.mark.depthKm !== null) lines.push(`${String(Math.round(p.mark.depthKm))} km deep`);
  return lines;
}

const numOr = (n: number | null, f: (x: number) => string): string => (n === null ? DASH : f(n));
const deltaOr = (a: number | null, b: number | null, f: (d: number) => string): string =>
  a === null || b === null ? DASH : f(b - a);

/** Card time values: two earthquakes in the same year drop it (`10-13 10:00`), anything else keeps the full form. */
function cardTimes(from: MarkPoint, to: MarkPoint, zone: Zone): [string, string] {
  const l = whenText(from, zone, false);
  const t = whenText(to, zone, false);
  const quakes = from.mark.kind === "event" && to.mark.kind === "event";
  return quakes && l.slice(0, 4) === t.slice(0, 4) ? [l.slice(5), t.slice(5)] : [l, t];
}

/** The card for an edge read from the left mark to the top mark. */
export function cardOf(from: MarkPoint, to: MarkPoint, zone: Zone): Card {
  const a = from.mark;
  const b = to.mark;
  const [left, top] = cardTimes(from, to, zone);
  return {
    rows: [
      { label: "time", left, delta: signedOffset(from, to), top },
      {
        label: "M",
        left: numOr(a.mag, (m) => fmtMag(m)),
        delta: deltaOr(a.mag, b.mag, (d) => fmtSigned(d, 1)),
        top: numOr(b.mag, (m) => fmtMag(m)),
      },
      {
        label: "depth",
        left: numOr(a.depthKm, (z) => `${String(Math.round(z))} km`),
        delta: deltaOr(a.depthKm, b.depthKm, (d) => `${fmtSigned(Math.round(d), 0)} km`),
        top: numOr(b.depthKm, (z) => `${String(Math.round(z))} km`),
      },
    ],
    km: distanceKm({ latitude: a.lat, longitude: a.lon }, { latitude: b.lat, longitude: b.lon }),
  };
}

/** The distance footer of a card. */
export const kmText = (km: number): string => `${fmtInt(Math.round(km))} km apart`;

/** Lays the points out as the staircase: the left column holds n − 1 cards, each column to the right one fewer. */
export function staircase(points: MarkPoint[], zone: Zone): Staircase {
  const cols = points.slice(0, -1);
  return {
    cols,
    rows: points.slice(1).map((p, i) => ({
      p,
      cells: cols.map((q, c) => (c <= i ? cardOf(p, q, zone) : null)),
    })),
  };
}

/** The grid's row header and one column, in CSS pixels, as `styles.css` sizes them (node or card plus spacing). */
export const ROW_HEADER_PX = 220;
export const COL_PX = 340;
export const matrixWidthPx = (n: number): number => ROW_HEADER_PX + (n - 1) * COL_PX;

/** The Compare button's tooltip: what it compares, and a warning when the grid will overflow the given width. */
export function compareTitle(n: number, availablePx: number): string {
  if (n < 2) return "Mark at least two events to compare them";
  const head = `Compare ${String(n)} events pairwise`;
  const w = matrixWidthPx(n);
  return w > availablePx
    ? `${head} · about ${fmtInt(w)} px wide, wider than this window; the grid will scroll sideways`
    : head;
}
