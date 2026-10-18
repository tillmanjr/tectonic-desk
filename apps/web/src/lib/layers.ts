import type { ApiEvent, ApiEventGrid, Volcano } from "@tectonic/shared";
import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";
import { createAnimation, DAY_MS, type Animation } from "./animation.js";
import type { Catalog } from "./catalog.js";
import type { Clock } from "./clock.js";
import { densityLegendFor, type DensityLegend } from "./density.js";
import { fmtFloor, fmtInt, fmtMag, fmtShort, placeOf, type Zone } from "./format.js";
import { TIP_LIFT, type MapView } from "./mapview.js";
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
  const showMech = ref(true);
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
