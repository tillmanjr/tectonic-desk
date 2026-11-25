import type { ApiEvent, ApiEventGrid, ApiShakeMap, Volcano } from "@tectonic/shared";
import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import type { ApiClient } from "./api.js";
import { createAnimation, DAY_MS, type Animation } from "./animation.js";
import type { Catalog } from "./catalog.js";
import type { Clock } from "./clock.js";
import { densityLegendFor, type DensityLegend } from "./density.js";
import { fmtFloor, fmtInt, fmtMag, fmtShort, placeOf, type Zone } from "./format.js";
import { TIP_LIFT, type MapView } from "./mapview.js";
import { distanceKm } from "./sequence.js";
import { hasShakeMap, loadShakeMap, mmiAt, mmiText } from "./shakemap.js";
import {
  aviationColor,
  lastEruptionText,
  statusLabel,
  statusRank,
  TYPE_GROUPS,
  typeGroup,
  type VolcanoStore,
} from "./volcanoes.js";

export interface QuakeLayer {
  showMech: Ref<boolean>;
  showDensity: Ref<boolean>;
  /** The window's density grid, present only when the floor was raised. */
  density: ComputedRef<ApiEventGrid | null>;
  densityLegend: ComputedRef<DensityLegend | null>;
  anim: Animation;
  /** What the map draws: everything, or only what has happened by the animation cursor. */
  shown: ComputedRef<ApiEvent[]>;
  /** How many of the window's events the refinements leave on the map, and at what floor. */
  countLine: ComputedRef<string>;
  openAnimation(): void;
  onHover(payload: { e: ApiEvent; x: number; y: number }): void;
}

/** The earthquake half of a map: density, animation, count line, tips and zoom-to-selection. Call inside setup. */
export function useQuakeLayer(o: {
  catalog: Catalog;
  clock: Clock;
  zone: Readonly<Ref<Zone>>;
  mv: MapView;
}): QuakeLayer {
  const { catalog, clock, zone, mv } = o;
  const events = catalog.filtered;
  // Off by default: beachballs at the window's magnitudes crowd the map; a reader turns them on.
  const showMech = ref(false);
  const showDensity = ref(false);
  const density = computed(() => {
    const s = catalog.stats.value;
    return catalog.raised.value && s !== null ? s.grid : null;
  });
  const densityLegend = computed(() =>
    density.value === null || !showDensity.value
      ? null
      : densityLegendFor(density.value, catalog.requested.value),
  );
  const anim = createAnimation();
  /** The loaded window, never reaching past now: the date range, else the preset's trailing days. */
  const windowBounds = computed(() => {
    const now = clock.now.value;
    const win = catalog.range.value;
    if (win !== null) {
      const end = new Date(Math.min(Date.parse(win.until), now.getTime()));
      return { start: new Date(win.since), end };
    }
    return { start: new Date(now.getTime() - catalog.requireRegion().days * DAY_MS), end: now };
  });
  const countLine = computed(() => {
    const base = `Showing ${String(events.value.length)} of ${fmtInt(catalog.windowTotal.value)} events`;
    return catalog.raised.value ? `${base} · markers at ${fmtFloor(catalog.floor.value)}` : base;
  });
  const shown = computed(() => {
    const c = anim.cursor.value;
    if (c === null) return events.value;
    const t = c.getTime();
    return events.value.filter((e) => Date.parse(e.time) <= t);
  });
  watch(catalog.selected, (e) => {
    if (e !== null) mv.zoomTo(e.longitude, e.latitude);
  });
  onUnmounted(() => {
    anim.close();
  });
  return {
    showMech,
    showDensity,
    density,
    densityLegend,
    anim,
    shown,
    countLine,
    openAnimation() {
      anim.open(windowBounds.value.start, windowBounds.value.end, zone.value);
    },
    onHover(payload) {
      const { e } = payload;
      const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
      const type = e.magType === null ? "" : ` ${e.magType}`;
      mv.showTip(
        `M${fmtMag(e.mag)}${type} · ${depth} km · ${placeOf(e)} · ${fmtShort(e.time, zone.value)}`,
        payload.x,
        payload.y,
      );
    },
  };
}

/** Where the ShakeMap layer stands for the selected event. */
export type ShakeState = "off" | "none" | "loading" | "ready" | "missing" | "error";

export interface ShakeLayer {
  /** The reader's toggle; it stays on across selections. */
  show: Ref<boolean>;
  /** Whether the selected event lists a ShakeMap, so the toggle can be used. */
  available: ComputedRef<boolean>;
  state: ComputedRef<ShakeState>;
  /** The selected event's ShakeMap while shown and loaded. */
  map: ShallowRef<ApiShakeMap | null>;
}

/**
 * The selected earthquake's USGS ShakeMap as intensity bands under the markers. The map's readout
 * is the MMI under the pointer and the point's distance from the epicentre. Loads only while
 * shown, once per event. Call inside setup.
 */
export function useShakeLayer(o: { api: ApiClient; catalog: Catalog; mv: MapView }): ShakeLayer {
  const { api, catalog, mv } = o;
  const show = ref(false);
  const map = shallowRef<ApiShakeMap | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  /**
   * A loaded event says whether the feed lists a ShakeMap; a selection the page has not loaded
   * (opened from a mark, say) is given the benefit of the doubt and the server answers.
   */
  const available = computed(() => {
    const id = catalog.selectedId.value;
    const e = catalog.selected.value;
    return id !== null && (e === null || hasShakeMap(e));
  });
  let seq = 0;
  watch(
    [show, catalog.selectedId, available],
    ([on, id, ok]) => {
      const token = ++seq;
      map.value = null;
      failed.value = false;
      loading.value = false;
      if (!on || id === null || !ok) return;
      loading.value = true;
      loadShakeMap(api, id)
        .then((m) => {
          if (token !== seq) return;
          map.value = m;
        })
        .catch(() => {
          if (token === seq) failed.value = true;
        })
        .finally(() => {
          if (token === seq) loading.value = false;
        });
    },
    { immediate: true },
  );
  const state = computed<ShakeState>(() => {
    if (!show.value) return "off";
    if (!available.value) return "none";
    if (loading.value) return "loading";
    if (failed.value) return "error";
    return map.value === null ? "missing" : "ready";
  });
  watch(
    map,
    (m) => {
      mv.probe.value =
        m === null
          ? null
          : ([lon, lat]) => {
              const v = mmiAt(m.grid, lon, lat);
              const text = v === null ? null : mmiText(v);
              // a response cached before the server sent the epicentre falls back to the loaded event
              const e = m.epicentre ?? catalog.selected.value;
              if (text === null || e === null) return text;
              const km = distanceKm(e, { latitude: lat, longitude: lon });
              return `${text} · ${fmtInt(Math.round(km))} km from the epicentre`;
            };
    },
    { immediate: true },
  );
  return { show, available, state, map };
}

export interface VolcanoLayer {
  countLine: ComputedRef<string>;
  /** The ring colour for a volcano above normal at its agency; null for normal or unmonitored. */
  ringOf(number: number): string | null;
  onHover(payload: { v: Volcano; x: number; y: number }): void;
}

/** The volcano half of a map: count line, status rings, tips and zoom-to-selection. Call inside setup. */
export function useVolcanoLayer(o: { store: VolcanoStore; mv: MapView }): VolcanoLayer {
  const { store, mv } = o;
  const countLine = computed(
    () =>
      `Showing ${String(store.filtered.value.length)} of ${String(store.inRegion.value.length)} volcanoes`,
  );
  /** The ranked status, highest first, that gives a volcano its ring colour. */
  function topStatus(number: number) {
    const list = store.statusesOf.value.get(number) ?? [];
    return [...list].sort((a, b) => statusRank(b) - statusRank(a))[0] ?? null;
  }
  watch(store.selected, (v) => {
    if (v !== null) mv.zoomTo(v.lon, v.lat);
  });
  return {
    countLine,
    ringOf(number) {
      const top = topStatus(number);
      return top !== null && statusRank(top) > 0 ? aviationColor(top.color) : null;
    },
    onHover(payload) {
      const { v } = payload;
      const top = topStatus(v.number);
      const parts = [v.name, TYPE_GROUPS[typeGroup(v.type)], lastEruptionText(v)];
      if (top !== null && statusRank(top) > 0) parts.push(statusLabel(top));
      if (store.continuing.value.has(v.number)) parts.push("eruption continuing (GVP)");
      mv.showTip(parts.join(" · "), payload.x, payload.y - TIP_LIFT);
    },
  };
}
