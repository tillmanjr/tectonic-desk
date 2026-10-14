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

/** How far back the date filter may reach. */
export const RANGE_DAYS = 90;

/** The selectable date span: today minus `RANGE_DAYS` to today, as calendar days in the zone. */
export interface DateBounds {
  min: string;
  max: string;
}

export function dateBoundsFor(now: Date, zone: Zone): DateBounds {
  return {
    min: dateIn(new Date(now.getTime() - RANGE_DAYS * 864e5).toISOString(), zone),
    max: dateIn(now.toISOString(), zone),
  };
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

function within(value: number | null, min: number | null, max: number | null): boolean {
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

/**
 * The server-side window for a date filter: from the start of `since` (or of
 * the earliest selectable day) to the end of `until` (or of today), in the
 * zone. Null when neither date is set.
 */
export function rangeInstants(f: EventFilter, zone: Zone, now: Date): Range | null {
  if (!hasRange(f)) return null;
  const bounds = dateBoundsFor(now, zone);
  return {
    since: dayStart(f.since ?? bounds.min, zone).toISOString(),
    until: dayEnd(f.until ?? bounds.max, zone).toISOString(),
  };
}
