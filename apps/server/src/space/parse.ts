import {
  AURORA_CELLS,
  AURORA_HEIGHT,
  AURORA_WIDTH,
  auroraIndex,
  type AuroraFrame,
  type ScalesKind,
  type SpaceAlert,
  type SpaceFlare,
  type SpaceSample,
  type SpaceScales,
  type SpaceSeries,
} from "@tectonic/shared";
import type {
  AlertRow,
  AuroraDoc,
  DstRow,
  FlareRow,
  GoesFluxRow,
  Kp1mRow,
  Kp3hRow,
  KpForecastRow,
  MagRow,
  ScalesDoc,
  WindRow,
} from "./schema.js";

/**
 * SWPC rows to samples and records. Every time is UTC: most files omit the `Z`, the GOES
 * files carry it, the alerts write `2026-10-24 09:04:23.307`. Rows without a value are skipped.
 */
export function parseTime(text: string | null | undefined): Date | null {
  if (text === null || text === undefined) return null;
  const iso = text.trim().replace(" ", "T");
  const zoned = /(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(zoned);
  return Number.isNaN(ms) ? null : new Date(ms);
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

interface Timed {
  time_tag: string;
}

/** Samples of one series from the rows whose value is a finite number and whose time parses. */
function pick<R extends Timed>(
  series: SpaceSeries,
  rows: R[],
  source: (r: R) => string,
  value: (r: R) => number | null | undefined,
): SpaceSample[] {
  const out: SpaceSample[] = [];
  for (const r of rows) {
    const v = value(r);
    const time = parseTime(r.time_tag);
    if (finite(v) && time !== null) out.push({ series, time, source: source(r), value: v });
  }
  return out;
}

const SWPC = (): string => "swpc";
const KYOTO = (): string => "kyoto";
const goes = (r: GoesFluxRow): string => `GOES-${String(r.satellite)}`;

export const parseKp1m = (rows: Kp1mRow[]): SpaceSample[] =>
  pick("kp_1m", rows, SWPC, (r) => r.estimated_kp);
export const parseKp3h = (rows: Kp3hRow[]): SpaceSample[] => pick("kp_3h", rows, SWPC, (r) => r.Kp);
export const parseDst = (rows: DstRow[]): SpaceSample[] => pick("dst", rows, KYOTO, (r) => r.dst);

/** Bz (GSM) and Bt from the rows the forecasters marked active; the spacecraft is the source. */
export function parseMag(rows: MagRow[]): SpaceSample[] {
  const active = rows.filter((r) => r.active);
  const source = (r: MagRow): string => r.source;
  return [
    ...pick("bz_gsm", active, source, (r) => r.bz_gsm),
    ...pick("bt", active, source, (r) => r.bt),
  ];
}

export function parseWind(rows: WindRow[]): SpaceSample[] {
  const active = rows.filter((r) => r.active);
  const source = (r: WindRow): string => r.source;
  return [
    ...pick("speed", active, source, (r) => r.proton_speed),
    ...pick("density", active, source, (r) => r.proton_density),
  ];
}

/** The two GOES X-ray channels by their `energy` label. */
export function parseXrays(rows: GoesFluxRow[]): SpaceSample[] {
  const of = (energy: string, series: SpaceSeries): SpaceSample[] =>
    pick(
      series,
      rows.filter((r) => r.energy === energy),
      goes,
      (r) => r.flux,
    );
  return [...of("0.1-0.8nm", "xray_long"), ...of("0.05-0.4nm", "xray_short")];
}

/** The ≥10 and ≥100 MeV integral proton channels. */
export function parseProtons(rows: GoesFluxRow[]): SpaceSample[] {
  const of = (energy: string, series: SpaceSeries): SpaceSample[] =>
    pick(
      series,
      rows.filter((r) => r.energy === energy),
      goes,
      (r) => r.flux,
    );
  return [...of(">=10 MeV", "p10"), ...of(">=100 MeV", "p100")];
}

const textOrNull = (s: string | null | undefined): string | null =>
  s === undefined || s === null || s === "" ? null : s;

export function parseFlares(rows: FlareRow[]): SpaceFlare[] {
  const out: SpaceFlare[] = [];
  for (const r of rows) {
    const beginTime = parseTime(r.begin_time);
    if (beginTime === null) continue;
    out.push({
      beginTime,
      maxTime: parseTime(r.max_time),
      endTime: parseTime(r.end_time),
      beginClass: textOrNull(r.begin_class),
      maxClass: textOrNull(r.max_class),
      endClass: textOrNull(r.end_class),
      maxXrlong: finite(r.max_xrlong) ? r.max_xrlong : null,
      satellite: finite(r.satellite) ? r.satellite : null,
    });
  }
  return out;
}

export function parseAlerts(rows: AlertRow[]): SpaceAlert[] {
  const out: SpaceAlert[] = [];
  for (const r of rows) {
    const issueTime = parseTime(r.issue_datetime);
    if (issueTime !== null) out.push({ productId: r.product_id, issueTime, message: r.message });
  }
  return out;
}

/** A NOAA scale level or probability written as text (`"3"`, `"10"`), else null. */
export function scaleNumber(s: string | null | undefined): number | null {
  if (s === undefined || s === null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The UTC day of an instant as `YYYY-MM-DD`. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** The largest Kp per UTC day across the forecast file's observed, estimated and predicted rows. */
export function kpMaxByDay(rows: KpForecastRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const time = parseTime(r.time_tag);
    if (time === null || !finite(r.kp)) continue;
    const key = dayKey(time);
    const prev = out.get(key);
    if (prev === undefined || r.kp > prev) out.set(key, r.kp);
  }
  return out;
}

const SCALE_KEYS: { key: string; kind: ScalesKind }[] = [
  { key: "-1", kind: "observed" },
  { key: "0", kind: "observed" },
  { key: "1", kind: "predicted" },
  { key: "2", kind: "predicted" },
  { key: "3", kind: "predicted" },
];

/**
 * The scales document as rows per day. Observed days carry levels, predicted days carry R and
 * S probabilities with a predicted G level; `issued` is today's stamp for every row. Without a
 * `0` entry nothing is known about the issue time and the document yields no rows.
 */
export function parseScales(doc: ScalesDoc, kpMax: Map<string, number>): SpaceScales[] {
  const today = doc["0"];
  const issued = today === undefined ? null : parseTime(`${today.DateStamp} ${today.TimeStamp}`);
  if (issued === null) return [];
  const out: SpaceScales[] = [];
  for (const { key, kind } of SCALE_KEYS) {
    const e = doc[key];
    if (e === undefined) continue;
    const day = parseTime(e.DateStamp);
    if (day === null) continue;
    out.push({
      day,
      kind,
      issued,
      r: scaleNumber(e.R.Scale),
      s: scaleNumber(e.S.Scale),
      g: scaleNumber(e.G.Scale),
      rMinorProb: scaleNumber(e.R.MinorProb),
      rMajorProb: scaleNumber(e.R.MajorProb),
      sProb: scaleNumber(e.S.Prob),
      kpMax: kpMax.get(dayKey(day)) ?? null,
    });
  }
  return out;
}

/**
 * The OVATION frame as a byte grid in the feed's own order. A triple whose cell is off the
 * grid is skipped; a value is rounded and clamped to 0..100; a cell never named stays 0. The
 * power pair is null until `withPower` fills it.
 */
export function parseAuroraFrame(doc: AuroraDoc): AuroraFrame {
  const observed = parseTime(doc["Observation Time"]);
  const forecast = parseTime(doc["Forecast Time"]);
  if (observed === null || forecast === null) throw new Error("aurora frame times unreadable");
  const grid = new Uint8Array(AURORA_CELLS);
  for (const [lon, lat, value] of doc.coordinates) {
    const onGrid =
      Number.isInteger(lon) &&
      Number.isInteger(lat) &&
      lon >= 0 &&
      lon < AURORA_WIDTH &&
      lat >= -90 &&
      lat < AURORA_HEIGHT - 90;
    if (onGrid) grid[auroraIndex(lon, lat)] = Math.min(100, Math.max(0, Math.round(value)));
  }
  return { observed, forecast, powerNorth: null, powerSouth: null, grid };
}

export interface HemiPowerRow {
  observed: Date;
  north: number;
  south: number;
}

/**
 * `text/aurora-nowcast-hemi-power.txt`: `#` comments, then rows of observation time, forecast
 * time, north and south GW at `YYYY-MM-DD_HH:MM`. Rows that do not parse are skipped.
 */
export function parseHemiPower(text: string): HemiPowerRow[] {
  const out: HemiPowerRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4) continue;
    const observed = parseTime(fields[0]?.replace("_", "T"));
    const north = Number(fields[2]);
    const south = Number(fields[3]);
    if (observed !== null && Number.isFinite(north) && Number.isFinite(south)) {
      out.push({ observed, north, south });
    }
  }
  return out;
}

/** The frame with the power pair of the row observed at the same instant, if there is one. */
export function withPower(frame: AuroraFrame, rows: HemiPowerRow[]): AuroraFrame {
  const at = frame.observed.getTime();
  const row = rows.find((r) => r.observed.getTime() === at);
  return row === undefined ? frame : { ...frame, powerNorth: row.north, powerSouth: row.south };
}
