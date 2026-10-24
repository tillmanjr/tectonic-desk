import type { ApiEvent, Volcano } from "@tectonic/shared";
import { dayStart, within } from "./filters.js";
import type { Zone } from "./format.js";
import { typeGroup, type TypeGroup } from "./volcanoes.js";

/** Column filters a table applies to its own rows, after the store's filter and before sorting. */
export interface EventTableFilter {
  /** Calendar days in the zone in force, both inclusive. */
  since: string | null;
  until: string | null;
  minMag: number | null;
  maxMag: number | null;
  minDepth: number | null;
  maxDepth: number | null;
}
export interface VolcanoTableFilter {
  /** Case-insensitive substring of the name. */
  name: string | null;
  country: string | null;
  type: TypeGroup | null;
  /** Signed years as stored: BCE negative. */
  minYear: number | null;
  maxYear: number | null;
  minElev: number | null;
  maxElev: number | null;
}
export const EMPTY_EVENT_TABLE_FILTER: EventTableFilter = {
  since: null,
  until: null,
  minMag: null,
  maxMag: null,
  minDepth: null,
  maxDepth: null,
};
export const EMPTY_VOLCANO_TABLE_FILTER: VolcanoTableFilter = {
  name: null,
  country: null,
  type: null,
  minYear: null,
  maxYear: null,
  minElev: null,
  maxElev: null,
};

/** Keyed as the tables' sort keys, so a header's mark is one lookup. */
export type EventColumn = "time" | "mag" | "depthKm";
export type VolcanoColumn = "name" | "country" | "type" | "last" | "elevation";

const anySet = (...vals: unknown[]): boolean => vals.some((v) => v !== null);

/** The columns with at least one bound. */
export function activeEventColumns(f: EventTableFilter): Set<EventColumn> {
  const out = new Set<EventColumn>();
  if (anySet(f.since, f.until)) out.add("time");
  if (anySet(f.minMag, f.maxMag)) out.add("mag");
  if (anySet(f.minDepth, f.maxDepth)) out.add("depthKm");
  return out;
}
export function activeVolcanoColumns(f: VolcanoTableFilter): Set<VolcanoColumn> {
  const out = new Set<VolcanoColumn>();
  if (f.name !== null) out.add("name");
  if (f.country !== null) out.add("country");
  if (f.type !== null) out.add("type");
  if (anySet(f.minYear, f.maxYear)) out.add("last");
  if (anySet(f.minElev, f.maxElev)) out.add("elevation");
  return out;
}

/** The first instant of the day after `date`, in the zone; local days are built by calendar, not by 24 h. */
function nextDayStart(date: string, zone: Zone): number {
  const d = dayStart(date, zone);
  return zone === "utc"
    ? d.getTime() + 864e5
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** The rows within every set bound; the same array when nothing is set. */
export function applyEventTableFilter(
  events: ApiEvent[],
  f: EventTableFilter,
  zone: Zone,
): ApiEvent[] {
  if (activeEventColumns(f).size === 0) return events;
  const from = f.since === null ? -Infinity : dayStart(f.since, zone).getTime();
  const to = f.until === null ? Infinity : nextDayStart(f.until, zone);
  return events.filter((e) => {
    const t = Date.parse(e.time);
    return (
      t >= from &&
      t < to &&
      within(e.mag, f.minMag, f.maxMag) &&
      within(e.depthKm, f.minDepth, f.maxDepth)
    );
  });
}

export function applyVolcanoTableFilter(volcanoes: Volcano[], f: VolcanoTableFilter): Volcano[] {
  if (activeVolcanoColumns(f).size === 0) return volcanoes;
  const needle = f.name === null ? null : f.name.toLowerCase();
  return volcanoes.filter(
    (v) =>
      (needle === null || v.name.toLowerCase().includes(needle)) &&
      (f.country === null || v.country === f.country) &&
      (f.type === null || typeGroup(v.type) === f.type) &&
      within(v.lastEruptionYear, f.minYear, f.maxYear) &&
      within(v.elevationM, f.minElev, f.maxElev),
  );
}

/** Each country once, sorted, for the Country select. */
export const countriesOf = (volcanoes: Volcano[]): string[] =>
  [...new Set(volcanoes.map((v) => v.country))].sort((a, b) => a.localeCompare(b));
