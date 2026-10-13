import type { ApiEvent } from "@tectonic/shared";

/** Inclusive bounds; null means open. */
export interface EventFilter {
  minMag: number | null;
  maxMag: number | null;
  minDepth: number | null;
  maxDepth: number | null;
}

export const EMPTY_FILTER: EventFilter = {
  minMag: null,
  maxMag: null,
  minDepth: null,
  maxDepth: null,
};

export const FILTER_KEYS = ["minMag", "maxMag", "minDepth", "maxDepth"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function isActive(f: EventFilter): boolean {
  return FILTER_KEYS.some((k) => f[k] !== null);
}

/** A finite number from a query value or input string, else null. */
export function parseBound(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Reads the filter from URL query values; the magnitude minimum never goes below `floor`. */
export function parseFilter(query: Record<string, unknown>, floor: number): EventFilter {
  const minMag = parseBound(query.minMag);
  return {
    minMag: minMag === null ? null : Math.max(floor, minMag),
    maxMag: parseBound(query.maxMag),
    minDepth: parseBound(query.minDepth),
    maxDepth: parseBound(query.maxDepth),
  };
}

/** The query parameters for a filter; unset bounds are left out. */
export function filterQuery(f: EventFilter): Record<FilterKey, string | undefined> {
  const q: Record<FilterKey, string | undefined> = {
    minMag: undefined,
    maxMag: undefined,
    minDepth: undefined,
    maxDepth: undefined,
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

export function applyFilter(events: ApiEvent[], f: EventFilter): ApiEvent[] {
  if (!isActive(f)) return events;
  return events.filter(
    (e) => within(e.mag, f.minMag, f.maxMag) && within(e.depthKm, f.minDepth, f.maxDepth),
  );
}
