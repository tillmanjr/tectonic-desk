import type { ApiRegion } from "@tectonic/shared";
import { geoPath, type GeoPath } from "d3-geo";
import { select as d3select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import type { Feature, LineString } from "geojson";
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import type { ApiClient } from "./api.js";
import { mustRef } from "./dom.js";
import {
  AGE_CODES,
  faultFeatures,
  faultIndex,
  faultTitle,
  type AgeCode,
  type FaultFeature,
  type FaultHit,
} from "./faults.js";
import {
  frameFor,
  loadWorld,
  plateFeature,
  regionBasemap,
  worldBasemap,
  zoomTransformFor,
  type Basemap,
  type MapFrame,
  type PlateProps,
  type PlateSegment,
  type Topo,
} from "./geo.js";
import type { Tip } from "./tip.js";
import {
  coarsePointer,
  TOUCH_HINT_MS,
  TOUCH_HINTS,
  TOUCH_MIN_RADIUS_PX,
  touchCount,
  zoomAllowed,
} from "./touch.js";

/**
 * Everything a map page shares: the projected frame for the region, d3-zoom
 * with the lock and touch rules, the basemap, plate boundaries, teeth and
 * Quaternary faults with their hover lookups, the tooltip and the touch hints.
 * A page adds its own markers in the `layers` slot of `MapShell`.
 */

export interface MapViewOptions {
  api: ApiClient;
  /** The region to frame; the map resets and reloads its basemap when it changes. */
  region: () => ApiRegion;
  /** Animate zoom transitions (off in tests). */
  animate: () => boolean;
}

export interface MapViewFrame {
  region: ApiRegion;
  frame: MapFrame;
  path: GeoPath;
  minMag: number;
}

export interface MapView {
  view: ComputedRef<MapViewFrame>;
  svgEl: Ref<SVGSVGElement | null>;
  cardEl: Ref<HTMLElement | null>;
  transform: ShallowRef<ZoomTransform>;
  locked: Ref<boolean>;
  coarse: boolean;
  /** Floor on marker radius in viewBox units at zoom 1, for fingers; 0 with a mouse. */
  minRadius: ComputedRef<number>;
  touchHint: Ref<string | null>;
  tip: Ref<Tip | null>;
  basemap: ShallowRef<Basemap | null>;
  showPlates: Ref<boolean>;
  showTeeth: Ref<boolean>;
  plateSegments: ShallowRef<PlateSegment[]>;
  plates: ShallowRef<Feature<LineString, PlateProps>[]>;
  hoveredPlate: Ref<number | null>;
  faultAges: Ref<AgeCode[]>;
  pickOpen: Ref<boolean>;
  hasFaults: ComputedRef<boolean>;
  faultsOn: ComputedRef<boolean>;
  faultsAll: ComputedRef<boolean>;
  faultsPartial: ComputedRef<boolean>;
  faultCount: ComputedRef<string>;
  visibleFaults: ComputedRef<FaultFeature[]>;
  hoveredFault: Ref<FaultHit | null>;
  scaleBy(f: number): void;
  reset(): void;
  zoomTo(lon: number, lat: number): void;
  showTip(text: string, x: number, y: number): void;
  clearTip(): void;
  toggleLock(): void;
  setAllFaults(ev: Event): void;
  onPlateHover(payload: { index: number; title: string; x: number; y: number }): void;
  onPlateLeave(): void;
  onMapMove(ev: MouseEvent): void;
  onMapLeave(): void;
  onTouchStart(ev: Event): void;
}

/** Boundary and fault tooltips follow the pointer, so lift them clear of the cursor. */
export const TIP_LIFT = 10;
/** How close, in screen pixels, the pointer must come to a fault vertex. */
const FAULT_HIT_PX = 6;

let worldTopo: Topo | null = null;
const regionCache = new Map<string, Basemap>();

/** Drops the module-level basemap caches; for tests. */
export function resetMapCaches(): void {
  worldTopo = null;
  regionCache.clear();
}

export function useMapView(opts: MapViewOptions): MapView {
  const { api } = opts;
  const view = computed<MapViewFrame>(() => {
    const r = opts.region();
    const frame = frameFor(r);
    return { region: r, frame, path: geoPath(frame.projection), minMag: r.minMag };
  });

  const svgEl = ref<SVGSVGElement | null>(null);
  const cardEl = ref<HTMLElement | null>(null);
  const transform = shallowRef<ZoomTransform>(zoomIdentity);
  const showPlates = ref(true);
  const showTeeth = ref(true);
  const coarse = coarsePointer();
  /**
   * When set, wheel, drag and one finger leave the map alone (the page
   * scrolls); buttons, two fingers and zoom-to still work. The map starts
   * locked for every pointer so the page scrolls past it; the lock button
   * frees it.
   */
  const locked = ref(true);
  const cssScale = ref(1);
  function measure(): void {
    const width = mustRef(svgEl, "map svg").getBoundingClientRect().width;
    cssScale.value = width > 0 ? width / view.value.frame.width : 1;
  }
  const minRadius = computed(() => (coarse ? TOUCH_MIN_RADIUS_PX / cssScale.value : 0));
  const touchHint = ref<string | null>(null);
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  function showTouchHint(text: string): void {
    touchHint.value = text;
    if (hintTimer !== null) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      touchHint.value = null;
      hintTimer = null;
    }, TOUCH_HINT_MS);
  }
  function onTouchStart(ev: Event): void {
    if (locked.value && touchCount(ev) === 1) showTouchHint(TOUCH_HINTS.oneFingerOnLocked);
  }
  function toggleLock(): void {
    locked.value = !locked.value;
    if (coarse) showTouchHint(locked.value ? TOUCH_HINTS.locked : TOUCH_HINTS.unlocked);
  }

  const plateSegments = shallowRef<PlateSegment[]>([]);
  const plates = shallowRef<Feature<LineString, PlateProps>[]>([]);
  const basemap = shallowRef<Basemap | null>(null);
  const tip = ref<Tip | null>(null);
  const hoveredPlate = ref<number | null>(null);

  /** Which age classes of Quaternary faults are shown; empty means none. Opens on the historic and latest Quaternary classes. */
  const faultAges = ref<AgeCode[]>(["historic", "latest"]);
  const pickOpen = ref(false);
  const faults = shallowRef<FaultFeature[]>([]);
  let faultsRequested = false;
  const hoveredFault = ref<FaultHit | null>(null);
  /** The West Coast view is the only preset with a bbox, and the only one the fault file covers. */
  const hasFaults = computed(() => view.value.region.bbox !== null);
  const faultsOn = computed(() => hasFaults.value && faultAges.value.length > 0);
  const visibleFaults = computed(() =>
    faults.value.filter((f) => faultAges.value.includes(f.properties.age)),
  );
  const faultIdx = computed(() =>
    faultIndex(visibleFaults.value, (c) => view.value.frame.projection(c)),
  );
  const faultsAll = computed(() => faultAges.value.length === AGE_CODES.length);
  const faultsPartial = computed(() => faultAges.value.length > 0 && !faultsAll.value);
  const faultCount = computed(
    () => `${String(faultAges.value.length)} of ${String(AGE_CODES.length)}`,
  );
  function setAllFaults(ev: Event): void {
    const t = ev.target;
    faultAges.value = t instanceof HTMLInputElement && t.checked ? [...AGE_CODES] : [];
  }
  function closePickOnOutside(ev: MouseEvent): void {
    const t = ev.target;
    if (t instanceof Element && t.closest(".layerpick") !== null) return;
    pickOpen.value = false;
  }

  const zoomBehavior = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 40]);
  const defaultFilter = zoomBehavior.filter();
  zoomBehavior
    .filter(function (this: SVGSVGElement, ev: Event, d: unknown) {
      return zoomAllowed(locked.value, ev, () => defaultFilter.call(this, ev, d));
    })
    .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
      transform.value = ev.transform;
    });
  function svgSelection() {
    return d3select(mustRef(svgEl, "map svg"));
  }
  function applyTransform(t: ZoomTransform): void {
    const sel = svgSelection();
    if (opts.animate()) {
      sel
        .transition()
        .duration(300)
        .call((tr) => {
          zoomBehavior.transform(tr, t);
        });
    } else {
      zoomBehavior.transform(sel, t);
    }
  }
  function scaleBy(f: number): void {
    const sel = svgSelection();
    if (opts.animate()) {
      sel
        .transition()
        .duration(250)
        .call((tr) => {
          zoomBehavior.scaleBy(tr, f);
        });
    } else {
      zoomBehavior.scaleBy(sel, f);
    }
  }
  function reset(): void {
    applyTransform(zoomIdentity);
  }
  function zoomTo(lon: number, lat: number): void {
    applyTransform(zoomTransformFor(view.value.frame, lon, lat));
  }

  let loadSeq = 0;
  async function loadBasemap(r: ApiRegion): Promise<void> {
    const token = ++loadSeq;
    basemap.value = regionCache.get(r.id) ?? null;
    if (basemap.value !== null) return;
    try {
      let b: Basemap;
      if (r.bbox === null) {
        worldTopo ??= await loadWorld();
        b = worldBasemap(worldTopo);
      } else {
        // The API serves one set of regional outlines, clipped to the West Coast preset.
        const [land, states] = await Promise.all([api.geo("wc-land"), api.geo("wc-states")]);
        b = regionBasemap(land as Topo, states as Topo);
      }
      regionCache.set(r.id, b);
      if (token === loadSeq) basemap.value = b;
    } catch (e) {
      console.error("basemap failed to load", e);
    }
  }
  async function loadPlates(): Promise<void> {
    try {
      const segments = (await api.geo("plates")) as PlateSegment[];
      plateSegments.value = segments;
      plates.value = segments.map(plateFeature);
    } catch (e) {
      console.error("plate boundaries failed to load", e);
    }
  }
  async function loadFaults(): Promise<void> {
    if (faultsRequested) return;
    faultsRequested = true;
    try {
      faults.value = faultFeatures((await api.geo("wc-qfaults")) as Topo);
    } catch (e) {
      faultsRequested = false;
      console.error("quaternary faults failed to load", e);
    }
  }
  watch(
    faultsOn,
    (on) => {
      if (on) void loadFaults();
    },
    { immediate: true },
  );

  function showTip(text: string, x: number, y: number): void {
    const card = mustRef(cardEl, "map card").getBoundingClientRect();
    tip.value = { text, x: x - card.left, y: y - card.top };
  }
  function clearTip(): void {
    tip.value = null;
  }
  function onPlateHover(payload: { index: number; title: string; x: number; y: number }): void {
    hoveredPlate.value = payload.index;
    showTip(payload.title, payload.x, payload.y - TIP_LIFT);
  }
  function onPlateLeave(): void {
    hoveredPlate.value = null;
    tip.value = null;
  }
  /** Pointer position in the map's unzoomed projected space, and viewBox units per screen pixel. */
  function projectedPointer(ev: MouseEvent): { x: number; y: number; unit: number } {
    const rect = mustRef(svgEl, "map svg").getBoundingClientRect();
    const unit = view.value.frame.width / (rect.width || view.value.frame.width);
    const [x, y] = transform.value.invert([
      (ev.clientX - rect.left) * unit,
      (ev.clientY - rect.top) * unit,
    ]);
    return { x, y, unit };
  }
  /** Fault traces have no hit paths of their own; the svg looks one up under the pointer. */
  function onMapMove(ev: MouseEvent): void {
    if (!faultsOn.value || visibleFaults.value.length === 0) return;
    const target = ev.target;
    if (target instanceof Element && target.closest("[data-hit]") !== null) return;
    const { x, y, unit } = projectedPointer(ev);
    const hit = faultIdx.value.nearest(x, y, (FAULT_HIT_PX * unit) / transform.value.k);
    if (hit === null) {
      onMapLeave();
      return;
    }
    hoveredFault.value = hit;
    showTip(faultTitle(hit.feature.properties), ev.clientX, ev.clientY - TIP_LIFT);
  }
  function onMapLeave(): void {
    if (hoveredFault.value === null) return;
    hoveredFault.value = null;
    tip.value = null;
  }

  watch(
    () => view.value.region,
    (r) => {
      reset();
      void loadBasemap(r);
    },
  );
  onMounted(() => {
    document.addEventListener("mousedown", closePickOnOutside);
    window.addEventListener("resize", measure);
    measure();
    svgSelection().call(zoomBehavior).on("dblclick.zoom", null);
    void loadBasemap(view.value.region);
    void loadPlates();
  });
  onUnmounted(() => {
    document.removeEventListener("mousedown", closePickOnOutside);
    window.removeEventListener("resize", measure);
    if (hintTimer !== null) clearTimeout(hintTimer);
  });

  return {
    view,
    svgEl,
    cardEl,
    transform,
    locked,
    coarse,
    minRadius,
    touchHint,
    tip,
    basemap,
    showPlates,
    showTeeth,
    plateSegments,
    plates,
    hoveredPlate,
    faultAges,
    pickOpen,
    hasFaults,
    faultsOn,
    faultsAll,
    faultsPartial,
    faultCount,
    visibleFaults,
    hoveredFault,
    scaleBy,
    reset,
    zoomTo,
    showTip,
    clearTip,
    toggleLock,
    setAllFaults,
    onPlateHover,
    onPlateLeave,
    onMapMove,
    onMapLeave,
    onTouchStart,
  };
}
