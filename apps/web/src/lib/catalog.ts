import type { ApiEvent, ApiEventGrid, ApiRegion, ApiSummaryBin, SummaryBy } from "@tectonic/shared";
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient, type EventsFilterQuery } from "./api.js";
import { applyFilter, EMPTY_FILTER, type EventFilter, type Range } from "./filters.js";

export const EVENT_LIMIT = 2000;

/** The server filter for a window: the range when given, else the preset's trailing days up to now. */
export function filterQueryFor(
  region: ApiRegion,
  now: Date,
  range: Range | null,
  minMag: number,
): EventsFilterQuery {
  const q: EventsFilterQuery = {
    since:
      range === null ? new Date(now.getTime() - region.days * 864e5).toISOString() : range.since,
    minMag,
  };
  if (range !== null) q.until = range.until;
  if (region.bbox !== null) {
    const b = region.bbox;
    q.bbox = `${String(b.minLon)},${String(b.minLat)},${String(b.maxLon)},${String(b.maxLat)}`;
  }
  return q;
}

/**
 * The lowest floor whose window count fits the budget: the requested floor
 * itself, else the summary's whole-magnitude bands at or above it (M5, M6,
 * M7). M7 when nothing fits, or the request when that is higher still.
 */
export function chooseFloor(requested: number, bins: ApiSummaryBin[], budget: number): number {
  const sum = (of: (b: ApiSummaryBin) => number): number => bins.reduce((a, b) => a + of(b), 0);
  const counts: [number, number][] = [
    [requested, sum((b) => b.count)],
    [5, sum((b) => b.mags.m5 + b.mags.m6 + b.mags.m7)],
    [6, sum((b) => b.mags.m6 + b.mags.m7)],
    [7, sum((b) => b.mags.m7)],
  ];
  for (const [m, n] of counts) if (m >= requested && n <= budget) return m;
  return Math.max(7, requested);
}

/** Density cell size in degrees: coarse for the world, finer for a bounded view. */
export function gridCellFor(region: ApiRegion): number {
  return region.bbox === null ? 2 : 0.5;
}

/** What the server said about the loaded window. */
export interface WindowStats {
  /** Floor of the loaded list: the requested floor, or the band it was raised to. */
  floor: number;
  /** Events in the window at the requested floor. */
  total: number;
  by: SummaryBy;
  bins: ApiSummaryBin[];
  /** Density at the requested floor; null unless the floor was raised. */
  grid: ApiEventGrid | null;
}

export interface Catalog {
  regions: ShallowRef<ApiRegion[]>;
  region: ComputedRef<ApiRegion | null>;
  /** The preset window: feeds the summary tiles and the major-event cards. */
  events: ShallowRef<ApiEvent[]>;
  truncated: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectedId: Ref<string | null>;
  selected: ComputedRef<ApiEvent | null>;
  /** Magnitude and depth bounds applied to the map, table and charts. */
  filter: Ref<EventFilter>;
  /** The server-side date window of the map, table and charts; null only before a region is set. */
  range: Ref<Range | null>;
  /** The events of `range` when set, else the preset window. */
  windowEvents: ComputedRef<ApiEvent[]>;
  filtered: ComputedRef<ApiEvent[]>;
  /** The floor asked for: the preset's, raised by the filter minimum. */
  requested: ComputedRef<number>;
  /** The floor in force: `requested`, or the band the window was raised to so the list fits. */
  floor: ComputedRef<number>;
  /** The loaded window's summary and density; null until a range has loaded. */
  stats: ShallowRef<WindowStats | null>;
  /** True when the list floor is above the requested one. */
  raised: ComputedRef<boolean>;
  /** Events in the window at the requested floor, else the loaded count. */
  windowTotal: ComputedRef<number>;
  setFilter(f: EventFilter): void;
  setRange(r: Range | null): void;
  /** The active region; throws when none is set (components below the region guard never see that). */
  requireRegion(): ApiRegion;
  /** Loads the region presets. */
  init(): Promise<void>;
  /** Switches region and loads its events; false when the id is unknown. */
  setRegion(id: string): Promise<boolean>;
  select(id: string | null): void;
  /** Reloads the current region's events, keeping the selection. */
  refetch(): Promise<void>;
}

const sameRange = (a: Range | null, b: Range | null): boolean =>
  a === b || (a !== null && b !== null && a.since === b.since && a.until === b.until);

export function createCatalog(api: ApiClient, now: () => Date): Catalog {
  const regions = shallowRef<ApiRegion[]>([]);
  const regionId = ref<string | null>(null);
  const events = shallowRef<ApiEvent[]>([]);
  const rangeEvents = shallowRef<ApiEvent[] | null>(null);
  const stats = shallowRef<WindowStats | null>(null);
  const truncated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const region = computed(() => regions.value.find((r) => r.id === regionId.value) ?? null);
  const selected = computed(() => events.value.find((e) => e.id === selectedId.value) ?? null);
  const filter = ref<EventFilter>(EMPTY_FILTER);
  const range = ref<Range | null>(null);
  const windowEvents = computed(() => rangeEvents.value ?? events.value);
  const filtered = computed(() => applyFilter(windowEvents.value, filter.value));
  const requested = computed(() => {
    const base = region.value?.minMag ?? 0;
    const min = filter.value.minMag;
    return min === null ? base : Math.max(base, min);
  });
  const floor = computed(() => {
    const s = stats.value;
    return s === null ? requested.value : Math.max(s.floor, requested.value);
  });
  const raised = computed(() => floor.value > requested.value);
  const windowTotal = computed(() => stats.value?.total ?? windowEvents.value.length);
  let seq = 0;
  let rangeSeq = 0;

  async function load(r: ApiRegion): Promise<void> {
    const token = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const list = await api.events({
        ...filterQueryFor(r, now(), null, r.minMag),
        limit: EVENT_LIMIT,
      });
      if (token !== seq) return;
      events.value = list.events;
      if (range.value === null) truncated.value = list.truncated;
    } catch (e) {
      if (token !== seq) return;
      error.value = errorMessage(e);
    } finally {
      if (token === seq) loading.value = false;
    }
  }

  async function loadRange(r: ApiRegion, win: Range): Promise<void> {
    const token = ++rangeSeq;
    loading.value = true;
    error.value = null;
    try {
      const req = requested.value;
      const base = filterQueryFor(r, now(), win, req);
      const s = await api.summary(base);
      if (token !== rangeSeq) return;
      const lower = chooseFloor(req, s.bins, EVENT_LIMIT);
      const [list, grid] = await Promise.all([
        api.events({ ...base, minMag: lower, limit: EVENT_LIMIT }),
        lower > req ? api.grid({ ...base, cell: gridCellFor(r) }) : Promise.resolve(null),
      ]);
      if (token !== rangeSeq) return;
      rangeEvents.value = list.events;
      truncated.value = list.truncated;
      stats.value = {
        floor: lower,
        total: s.bins.reduce((a, b) => a + b.count, 0),
        by: s.by,
        bins: s.bins,
        grid,
      };
    } catch (e) {
      if (token !== rangeSeq) return;
      error.value = errorMessage(e);
    } finally {
      if (token === rangeSeq) loading.value = false;
    }
  }

  async function loadAll(r: ApiRegion): Promise<void> {
    const win = range.value;
    await Promise.all([load(r), win === null ? Promise.resolve() : loadRange(r, win)]);
  }

  /** Forgets the loaded window and invalidates any answer still in flight for it. */
  function dropRange(): void {
    rangeSeq += 1;
    rangeEvents.value = null;
    stats.value = null;
  }

  return {
    regions,
    region,
    events,
    truncated,
    loading,
    error,
    selectedId,
    selected,
    filter,
    range,
    windowEvents,
    filtered,
    requested,
    floor,
    stats,
    raised,
    windowTotal,
    setFilter(f) {
      const before = requested.value;
      filter.value = f;
      const reg = region.value;
      const win = range.value;
      if (requested.value === before || reg === null || win === null) return;
      void loadRange(reg, win);
    },
    setRange(r) {
      if (sameRange(range.value, r)) return;
      range.value = r;
      dropRange();
      const reg = region.value;
      if (r === null || reg === null) return;
      void loadRange(reg, r);
    },
    requireRegion() {
      const r = region.value;
      if (r === null) throw new Error("no region selected");
      return r;
    },
    async init() {
      try {
        regions.value = await api.regions();
      } catch (e) {
        error.value = errorMessage(e);
      }
    },
    async setRegion(id) {
      const r = regions.value.find((x) => x.id === id);
      if (r === undefined) return false;
      if (regionId.value === id) return true;
      regionId.value = id;
      selectedId.value = null;
      events.value = [];
      dropRange();
      truncated.value = false;
      await loadAll(r);
      return true;
    },
    select(id) {
      selectedId.value = id;
    },
    async refetch() {
      const r = region.value;
      if (r !== null) await loadAll(r);
    },
  };
}
