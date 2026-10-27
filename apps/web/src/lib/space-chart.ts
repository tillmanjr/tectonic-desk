import type { ApiSpaceFlare, SpaceSeries } from "@tectonic/shared";
import type { Tick } from "./charts.js";
import { gLevel } from "./space-format.js";

/** `[epoch ms, value]` pairs, ascending, as the window read returns them. */
export type Points = [number, number][];

export interface RefLine {
  value: number;
  label: string;
}

/** A series drawn against its own right-hand axis. */
export interface RightAxis {
  series: SpaceSeries;
  unit: string;
  domain: (values: number[]) => [number, number];
}

export type RowId = "kp" | "dst" | "power" | "mag" | "wind" | "xray" | "protons" | "sun";

export interface RowSpec {
  id: RowId;
  label: string;
  unit: string;
  /** Drawn at a long range (past 93 days), where only the archived indices have points. */
  long: boolean;
  /** Series against the left axis, in draw order (the first is the row's main line). */
  series: SpaceSeries[];
  right: RightAxis | null;
  scale: "linear" | "log";
  domain: (values: number[]) => [number, number];
  refs: RefLine[];
  /** Tick values and labels for a log axis; linear rows use the scale's own. */
  ticks: ((lo: number, hi: number) => number[]) | null;
  tickLabel: ((value: number) => string) | null;
}

const extent = (values: number[]): [number, number] => {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
};

/** A symmetric domain about zero, at least ±minHalf. */
export function aroundZero(values: number[], minHalf: number): [number, number] {
  const [lo, hi] = extent(values);
  const m = Math.max(minHalf, Math.abs(lo), Math.abs(hi));
  return [-m, m];
}

/** The data's span stretched to include zero and padded a tenth each way, at least `pad`. */
export function spanWithZero(values: number[], pad: number): [number, number] {
  const [lo, hi] = extent(values);
  const low = Math.min(0, lo);
  const high = Math.max(0, hi);
  const p = Math.max(pad, (high - low) * 0.1);
  return [low - p, high + p];
}

/** The data's span, never narrower than [lo0, hi0], padded a twentieth each way. */
export function spanAtLeast(values: number[], lo0: number, hi0: number): [number, number] {
  const [lo, hi] = extent(values);
  const low = Math.min(lo0, lo);
  const high = Math.max(hi0, hi);
  const p = (high - low) * 0.05;
  return [low - p, high + p];
}

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** `10⁻⁵` for 1e-5; whole decades only. */
export function fmtDecade(v: number): string {
  const exp = String(Math.round(Math.log10(v)));
  return `10${exp.replace("-", "⁻").replace(/\d/g, (d) => SUPERSCRIPT_DIGITS.charAt(Number(d)))}`;
}

const XRAY_CLASSES: Record<number, string> = {
  [-8]: "A",
  [-7]: "B",
  [-6]: "C",
  [-5]: "M",
  [-4]: "X",
};
/** The GOES class letter whose flux range starts at a decade, else the decade itself. */
export const xrayTickLabel = (v: number): string =>
  XRAY_CLASSES[Math.round(Math.log10(v))] ?? fmtDecade(v);

export const ROWS: RowSpec[] = [
  {
    id: "kp",
    label: "Kp",
    unit: "",
    long: true,
    series: ["kp_1m", "kp_3h", "kp_gfz"],
    right: null,
    scale: "linear",
    domain: () => [0, 9],
    refs: [{ value: 5, label: "G1" }],
    ticks: null,
    tickLabel: null,
  },
  {
    id: "dst",
    label: "Dst",
    unit: "nT",
    long: true,
    series: ["dst"],
    right: null,
    scale: "linear",
    domain: (v) => spanWithZero(v, 20),
    refs: [{ value: 0, label: "" }],
    ticks: null,
    tickLabel: null,
  },
  {
    id: "power",
    label: "Hemispheric power N · S",
    unit: "GW",
    long: false,
    series: ["hp_north", "hp_south"],
    right: null,
    scale: "linear",
    domain: (v) => spanAtLeast(v, 0, 40),
    refs: [],
    ticks: null,
    tickLabel: null,
  },
  {
    id: "mag",
    label: "Bz · Bt",
    unit: "nT",
    long: false,
    series: ["bz_gsm", "bt"],
    right: null,
    scale: "linear",
    domain: (v) => aroundZero(v, 5),
    refs: [{ value: 0, label: "" }],
    ticks: null,
    tickLabel: null,
  },
  {
    id: "wind",
    label: "Speed · density",
    unit: "km/s",
    long: false,
    series: ["speed"],
    right: { series: "density", unit: "/cm³", domain: (v) => spanAtLeast(v, 0, 10) },
    scale: "linear",
    domain: (v) => spanAtLeast(v, 300, 500),
    refs: [],
    ticks: null,
    tickLabel: null,
  },
  {
    id: "xray",
    label: "X-ray",
    unit: "W/m²",
    long: false,
    series: ["xray_long", "xray_short"],
    right: null,
    scale: "log",
    domain: () => [1e-9, 1e-3],
    refs: [
      { value: 1e-5, label: "M1 · R1" },
      { value: 1e-4, label: "X1 · R3" },
    ],
    ticks: () => [1e-7, 1e-6, 1e-5, 1e-4],
    tickLabel: xrayTickLabel,
  },
  {
    id: "protons",
    label: "Protons ≥10 · ≥100 MeV",
    unit: "pfu",
    long: false,
    series: ["p10", "p100"],
    right: null,
    scale: "log",
    domain: (v) => [1e-2, Math.max(1e3, ...v.map((x) => x * 2))],
    refs: [
      { value: 10, label: "S1" },
      { value: 100, label: "S2" },
      { value: 1000, label: "S3" },
    ],
    ticks: (_lo, hi) => decadeTicks(1, hi),
    tickLabel: fmtDecade,
  },
  {
    id: "sun",
    label: "Sunspots · F10.7",
    unit: "",
    long: true,
    series: ["ssn"],
    right: { series: "f107", unit: "sfu", domain: (v) => spanAtLeast(v, 50, 150) },
    scale: "linear",
    domain: (v) => spanAtLeast(v, 0, 100),
    refs: [],
    ticks: null,
    tickLabel: null,
  },
];

/** The rows for a range: the long set past 93 days, else every row but the daily Sun row. */
export const rowsFor = (long: boolean): RowSpec[] =>
  ROWS.filter((r) => (long ? r.long : r.id !== "sun"));

/** Whole decades within a log domain, ascending. */
export function decadeTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) {
    out.push(10 ** e);
  }
  return out;
}

/** How often each series samples when stored raw. */
export const CADENCE_MS: Record<SpaceSeries, number> = {
  kp_1m: 60_000,
  kp_3h: 3 * 3_600_000,
  dst: 3_600_000,
  bz_gsm: 60_000,
  bt: 60_000,
  speed: 60_000,
  density: 60_000,
  xray_long: 60_000,
  xray_short: 60_000,
  p10: 300_000,
  p100: 300_000,
  hp_north: 300_000,
  hp_south: 300_000,
  kp_gfz: 3 * 3_600_000,
  ap: 86_400_000,
  ssn: 86_400_000,
  f107: 86_400_000,
};

/** The bucket in the unit that reads best: `7-minute`, `3-hour`, `23-day`. */
export function bucketWords(bucketSeconds: number): string {
  if (bucketSeconds < 7200) return `${String(Math.round(bucketSeconds / 60))}-minute`;
  if (bucketSeconds < 2 * 86_400) return `${String(Math.round(bucketSeconds / 3600))}-hour`;
  return `${String(Math.round(bucketSeconds / 86_400))}-day`;
}

/** How thinned points were made, for the captions; "" for raw rows. */
export const AGGREGATE_WORDS = "maxima (Kp, fluxes), minima (Dst, Bz) and means";
export const aggregateNote = (bucketSeconds: number | null): string =>
  bucketSeconds === null
    ? ""
    : `Points are ${bucketWords(bucketSeconds)} ${AGGREGATE_WORDS} over this window.`;

/** A line breaks where consecutive points lie more than three steps apart. */
export function gapMs(series: SpaceSeries, bucketSeconds: number | null): number {
  const step = bucketSeconds === null ? 0 : bucketSeconds * 1000;
  return Math.max(CADENCE_MS[series], step) * 3;
}

/**
 * SVG path data through the points, lifting the pen across gaps longer than `gap` and over
 * points the scale cannot place (a log scale given zero or a negative value).
 */
export function linePath(
  points: Points,
  x: (ms: number) => number,
  y: (value: number) => number,
  gap: number,
): string {
  let d = "";
  let pen = false;
  let last = Number.NEGATIVE_INFINITY;
  for (const [ms, value] of points) {
    const py = y(value);
    if (!Number.isFinite(py)) {
      pen = false;
      continue;
    }
    const cmd = pen && ms - last <= gap ? "L" : "M";
    d += `${cmd}${x(ms).toFixed(1)},${py.toFixed(1)}`;
    pen = true;
    last = ms;
  }
  return d;
}

/**
 * A step per point: horizontal over `widthMs` from each stamp, joined to the previous step
 * while the points lie within `gap`, the pen lifted over a gap or an unplottable value.
 */
export function kpStepPath(
  points: Points,
  x: (ms: number) => number,
  y: (value: number) => number,
  gap: number,
  widthMs: number,
): string {
  let d = "";
  let pen = false;
  let last = Number.NEGATIVE_INFINITY;
  for (const [ms, value] of points) {
    const py = y(value);
    if (!Number.isFinite(py)) {
      pen = false;
      continue;
    }
    const cmd = pen && ms - last <= gap ? "L" : "M";
    d += `${cmd}${x(ms).toFixed(1)},${py.toFixed(1)}H${x(ms + widthMs).toFixed(1)}`;
    pen = true;
    last = ms;
  }
  return d;
}

/** The points before an instant and those at or after it; a null instant leaves everything before. */
export function splitAt(points: Points, ms: number | null): { before: Points; after: Points } {
  if (ms === null) return { before: points, after: [] };
  const i = points.findIndex((p) => p[0] >= ms);
  if (i === -1) return { before: points, after: [] };
  return { before: points.slice(0, i), after: points.slice(i) };
}

/** The index of the point nearest an instant, or -1 for no points. */
export function nearestIndex(points: Points, ms: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(points[mid]?.[0]) < ms) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && ms - Number(points[lo - 1]?.[0]) < Number(points[lo]?.[0]) - ms) return lo - 1;
  return lo;
}

export interface FlareBand {
  key: string;
  startMs: number;
  endMs: number;
  label: string;
}

/** Flares as time bands; one still in progress runs to `nowMs`. */
export function flareBands(flares: ApiSpaceFlare[], nowMs: number): FlareBand[] {
  return flares.map((f) => ({
    key: f.beginTime,
    startMs: Date.parse(f.beginTime),
    endMs: f.endTime === null ? nowMs : Date.parse(f.endTime),
    label: f.maxClass ?? f.beginClass ?? "flare",
  }));
}

export interface KpBar {
  key: number;
  x: number;
  w: number;
  y: number;
  h: number;
  level: number;
}

/** Kp as bars from each stamp over `widthMs` (its 3-hour window, or the bucket when wider), coloured by G level. */
export function kpBars(
  points: Points,
  x: (ms: number) => number,
  y: (value: number) => number,
  bottom: number,
  widthMs: number,
): KpBar[] {
  return points.map(([ms, v]) => {
    const x0 = x(ms);
    const x1 = x(ms + widthMs);
    const top = y(v);
    return {
      key: ms,
      x: x0,
      w: Math.max(1, x1 - x0 - 1),
      y: top,
      h: bottom - top,
      level: gLevel(v),
    };
  });
}

/**
 * The viewBox x of a pointer event over an element drawn `width` units wide, or null when the
 * event has no element to measure against.
 */
export function viewX(
  ev: { clientX: number; currentTarget: EventTarget | null },
  width: number,
): number | null {
  const el = ev.currentTarget;
  if (!(el instanceof Element)) return null;
  const rect = el.getBoundingClientRect();
  return ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * width;
}

/** One drawn series of a row; `cls` marks a variant such as GFZ's preliminary stretch. */
export interface RowLine {
  series: SpaceSeries;
  d: string;
  cls?: string;
}

/** A flare shaded across a row. */
export interface RowBand {
  key: string;
  x: number;
  w: number;
  label: string;
  hl: boolean;
}

/** Everything `SpaceRow` draws, computed by `SpaceStack` from the window. */
export interface RowData {
  id: RowId;
  label: string;
  unit: string;
  rightUnit: string | null;
  top: number;
  bottom: number;
  yTicks: Tick[];
  yRight: Tick[];
  refs: { y: number; label: string }[];
  lines: RowLine[];
  bars: KpBar[];
  bands: RowBand[];
  /** Every series the row shows, for the pointer readout. */
  read: SpaceSeries[];
}
