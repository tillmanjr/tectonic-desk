import type { ApiEvent } from "@tectonic/shared";
import { dateIn, type Zone } from "./format.js";

/** Inclusive bounds; null means open. Dates are calendar days (YYYY-MM-DD) in the active zone. */
export interface EventFilter {
  minMag: number | null;
  maxMag: number | null;
  minDepth: number | null;
  maxDepth: number | null;
  since: string | null;
  until: string | null;
}

export const EMPTY_FILTER: EventFilter = {
  minMag: null,
  maxMag: null,
  minDepth: null,
  maxDepth: null,
  since: null,
  until: null,
};

export const NUMBER_KEYS = ["minMag", "maxMag", "minDepth", "maxDepth"] as const;
export const DATE_KEYS = ["since", "until"] as const;
export const FILTER_KEYS = [...NUMBER_KEYS, ...DATE_KEYS] as const;
export type NumberKey = (typeof NUMBER_KEYS)[number];
export type DateKey = (typeof DATE_KEYS)[number];
export type FilterKey = (typeof FILTER_KEYS)[number];

export function isActive(f: EventFilter): boolean {
  return FILTER_KEYS.some((k) => f[k] !== null);
}

export function hasRange(f: EventFilter): boolean {
  return f.since !== null || f.until !== null;
}

/** A finite number from a query value or input string, else null. */
export function parseBound(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A real calendar date in YYYY-MM-DD form, else null. */
export function parseDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v ? null : v;
}

/** The earliest day the catalogue can be asked for. */
export const CATALOG_START = "1900-01-01";

/** The selectable date span: the catalogue start to today, as calendar days in the zone. */
export interface DateBounds {
  min: string;
  max: string;
}

/** The calendar day, in the zone, `n` days before `now`. */
function daysAgo(now: Date, n: number, zone: Zone): string {
  return dateIn(new Date(now.getTime() - n * 864e5).toISOString(), zone);
}

export function dateBoundsFor(now: Date, zone: Zone): DateBounds {
  return { min: CATALOG_START, max: daysAgo(now, 0, zone) };
}

/** A quick window length offered by the Refine bar; `days` null means since the catalogue start. */
export interface Span {
  label: string;
  days: number | null;
}

export const SPANS: readonly Span[] = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "10 years", days: 3652 },
  { label: "50 years", days: 18262 },
  { label: "Since 1900", days: null },
];

/** The calendar day `days` before `until` (the catalogue start when null), never earlier than that start. */
export function spanStart(until: string, days: number | null): string {
  if (days === null) return CATALOG_START;
  const [y, m, d] = ymd(until);
  const day = new Date(Date.UTC(y, m, d) - days * 864e5).toISOString().slice(0, 10);
  return day < CATALOG_START ? CATALOG_START : day;
}

/** The calendar days a window covers, in the zone. */
export interface DateSpan {
  since: string;
  until: string;
}

/** How far back the window reaches when no start date is set. */
export const DEFAULT_DAYS = 30;

/**
 * The days actually queried, which the filter inputs show: each explicit bound,
 * else its default. The end defaults to today; the start to `DEFAULT_DAYS`
 * before today, pulled forward when an explicit end lies earlier than that.
 */
export function resolveDates(f: EventFilter, now: Date, zone: Zone): DateSpan {
  const until = f.until ?? daysAgo(now, 0, zone);
  const trailing = daysAgo(now, DEFAULT_DAYS, zone);
  return { since: f.since ?? (trailing < until ? trailing : until), until };
}

function clampDate(d: string | null, b: DateBounds): string | null {
  if (d === null) return null;
  if (d < b.min) return b.min;
  if (d > b.max) return b.max;
  return d;
}

/** Reads the filter from URL query values; the magnitude minimum never goes below `floor`, dates stay inside `bounds`. */
export function parseFilter(
  query: Record<string, unknown>,
  floor: number,
  bounds: DateBounds,
): EventFilter {
  const minMag = parseBound(query.minMag);
  const since = clampDate(parseDate(query.since), bounds);
  let until = clampDate(parseDate(query.until), bounds);
  if (since !== null && until !== null && until < since) until = since;
  return {
    minMag: minMag === null ? null : Math.max(floor, minMag),
    maxMag: parseBound(query.maxMag),
    minDepth: parseBound(query.minDepth),
    maxDepth: parseBound(query.maxDepth),
    since,
    until,
  };
}

/** The query parameters for a filter; unset bounds are left out. */
export function filterQuery(f: EventFilter): Record<FilterKey, string | undefined> {
  const q: Record<FilterKey, string | undefined> = {
    minMag: undefined,
    maxMag: undefined,
    minDepth: undefined,
    maxDepth: undefined,
    since: undefined,
    until: undefined,
  };
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v !== null) q[k] = String(v);
  }
  return q;
}

/** True when `value` lies within the set bounds (inclusive); null fails once a bound is set. */
export function within(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  if (value === null) return false;
  return (min === null || value >= min) && (max === null || value <= max);
}

/** The magnitude and depth bounds; dates are applied server-side through `rangeInstants`. */
export function applyFilter(events: ApiEvent[], f: EventFilter): ApiEvent[] {
  if (!NUMBER_KEYS.some((k) => f[k] !== null)) return events;
  return events.filter(
    (e) => within(e.mag, f.minMag, f.maxMag) && within(e.depthKm, f.minDepth, f.maxDepth),
  );
}

function ymd(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))];
}

/** First instant of a calendar day in the zone. */
export function dayStart(date: string, zone: Zone): Date {
  if (zone === "utc") return new Date(`${date}T00:00:00.000Z`);
  const [y, m, d] = ymd(date);
  return new Date(y, m, d, 0, 0, 0, 0);
}

/** Last instant of a calendar day in the zone. */
export function dayEnd(date: string, zone: Zone): Date {
  if (zone === "utc") return new Date(`${date}T23:59:59.999Z`);
  const [y, m, d] = ymd(date);
  return new Date(y, m, d, 23, 59, 59, 999);
}

/** ISO instants bounding the events query. */
export interface Range {
  since: string;
  until: string;
}

/** The server-side window for a day span: from the start of its first day to the end of its last, in the zone. */
export function rangeInstants(span: DateSpan, zone: Zone): Range {
  return {
    since: dayStart(span.since, zone).toISOString(),
    until: dayEnd(span.until, zone).toISOString(),
  };
}
