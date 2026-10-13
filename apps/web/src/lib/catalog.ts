import type { ApiEvent, ApiRegion } from "@tectonic/shared";
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient, type EventsQuery } from "./api.js";
import { applyFilter, EMPTY_FILTER, type EventFilter } from "./filters.js";

export const EVENT_LIMIT = 2000;

export function eventsQueryFor(region: ApiRegion, now: Date): EventsQuery {
  const q: EventsQuery = {
    since: new Date(now.getTime() - region.days * 864e5).toISOString(),
    minMag: region.minMag,
    limit: EVENT_LIMIT,
  };
  if (region.bbox !== null) {
    const b = region.bbox;
    q.bbox = `${String(b.minLon)},${String(b.minLat)},${String(b.maxLon)},${String(b.maxLat)}`;
  }
  return q;
}

export interface Catalog {
  regions: ShallowRef<ApiRegion[]>;
  region: ComputedRef<ApiRegion | null>;
  events: ShallowRef<ApiEvent[]>;
  truncated: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectedId: Ref<string | null>;
  selected: ComputedRef<ApiEvent | null>;
  /** Magnitude and depth bounds applied to the map, table and charts. */
  filter: Ref<EventFilter>;
  filtered: ComputedRef<ApiEvent[]>;
  /** Effective magnitude floor: the preset's, raised by the filter minimum. */
  floor: ComputedRef<number>;
  setFilter(f: EventFilter): void;
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

export function createCatalog(api: ApiClient, now: () => Date): Catalog {
  const regions = shallowRef<ApiRegion[]>([]);
  const regionId = ref<string | null>(null);
  const events = shallowRef<ApiEvent[]>([]);
  const truncated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const region = computed(() => regions.value.find((r) => r.id === regionId.value) ?? null);
  const selected = computed(() => events.value.find((e) => e.id === selectedId.value) ?? null);
  const filter = ref<EventFilter>(EMPTY_FILTER);
  const filtered = computed(() => applyFilter(events.value, filter.value));
  const floor = computed(() => {
    const base = region.value?.minMag ?? 0;
    const min = filter.value.minMag;
    return min === null ? base : Math.max(base, min);
  });
  let seq = 0;

  async function load(r: ApiRegion): Promise<void> {
    const token = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const list = await api.events(eventsQueryFor(r, now()));
      if (token !== seq) return;
      events.value = list.events;
      truncated.value = list.truncated;
    } catch (e) {
      if (token !== seq) return;
      error.value = errorMessage(e);
    } finally {
      if (token === seq) loading.value = false;
    }
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
    filtered,
    floor,
    setFilter(f) {
      filter.value = f;
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
      truncated.value = false;
      await load(r);
      return true;
    },
    select(id) {
      selectedId.value = id;
    },
    async refetch() {
      const r = region.value;
      if (r !== null) await load(r);
    },
  };
}
