import type { ApiRegion, FieldRaster, FieldsFile } from "@tectonic/shared";
import { geoPath, type GeoPath } from "d3-geo";
import { select as d3select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import type { Feature, LineString } from "geojson";
import {
  computed,
  nextTick,
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
import { loadBasemapFor, resetBasemapCache } from "./basemap-cache.js";
import { loadFields, rasterFor, resetFieldsCache, viewOf, type FieldChoice } from "./fields.js";
import { usePinTool, type PinTool } from "./pin-tool.js";
import { fmtLatLon, pinTitle, type PinsStore } from "./pins.js";
import { measureLines, measureOf } from "./measure.js";
import type { Section } from "./section.js";
import { useSectionTool, type SectionTool } from "./section-tool.js";
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
  invertPoint,
  projectPoint,
  plateFeature,
  zoomTransformFor,
  type Basemap,
  type MapFrame,
  type PlateProps,
  type PlateSegment,
  type Topo,
} from "./geo.js";
import { IN_THEATER } from "./theater.js";
import { DEFAULT_CENTRE } from "./centre.js";
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
  /** The section in the route and its setter, for the section tool. */
  section: Readonly<Ref<Section | null>>;
  setSection: (s: Section | null) => void;
  /** The reader's pins, one per map view. */
  pins: PinsStore;
  /** The global frame's centre longitude in the route and its setter; regional frames ignore it. */
  centre: Readonly<Ref<number>>;
  setCentre: (lon: number) => void;
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
  /** The aurora store's frame as bands over the night side; `MapShell` runs the store for it. */
  showAurora: Ref<boolean>;
  /** The anomaly raster to draw under the layers: none, gravity or magnetic. */
  field: Ref<FieldChoice>;
  /** The raster for the choice and the current frame; null while none, loading, failed or missing. */
  fieldRaster: ComputedRef<FieldRaster | null>;
  /** Whether the fields can be drawn: they are rendered for the global map at 150°E only. */
  fieldAvailable: ComputedRef<boolean>;
  /** The global map's centre longitude, and the setter that turns it. */
  centre: Readonly<Ref<number>>;
  setCentre: (lon: number) => void;
  /** True after the rasters file failed to load; the next choice retries. */
  fieldError: Ref<boolean>;
  /** The section tool: arming, placing and dragging the line. */
  section: SectionTool;
  /** The pin tool: the bar, placing the view's pin and moving it. */
  pin: PinTool;
  /**
   * The measure tool: the section tool's placing and dragging over a line kept in memory only
   * (its `halfKm` unused); `shown` is the line, `pending` and `cursor` the line being placed.
   */
  measure: SectionTool;
  /** Whether the Measure button reads as on: placing, or a line on the map. */
  measuring: ComputedRef<boolean>;
  /** The two lines the measure label reads, for the line placed, dragged or being placed; null for none. */
  measureText: ComputedRef<[string, string] | null>;
  /** Theater mode: the map and its toolbar fill the window over the rest of the page. */
  theater: Ref<boolean>;
  /** Enters or leaves theater mode; the map unlocks while in it and gets its lock back after. */
  toggleTheater(): void;
  /** Arms the measure tool, or clears the measurement and disarms it. */
  toggleMeasure(): void;
  onMeasureDragMove(ev: PointerEvent): void;
  /**
   * A page layer's readout for the lon/lat under the pointer (the ShakeMap intensity), or null
   * for none there; consulted where no marker, boundary or fault has a tip of its own.
   */
  probe: ShallowRef<((lonLat: [number, number]) => string | null) | null>;
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
  /** Moves the map to a zoom transform, as a reader's pan and zoom would. */
  setTransform(t: ZoomTransform): void;
  zoomTo(lon: number, lat: number): void;
  showTip(text: string, x: number, y: number): void;
  clearTip(): void;
  toggleLock(): void;
  setAllFaults(ev: Event): void;
  onPlateHover(payload: { index: number; title: string; x: number; y: number }): void;
  onPlateLeave(): void;
  onMapMove(ev: MouseEvent): void;
  onMapLeave(): void;
  /** Records where a press began, so a click that ends a pan is not a placement. */
  onMapDown(ev: MouseEvent): void;
  /** Places a section point or the pin while its tool is armed. */
  onMapClick(ev: MouseEvent): void;
  onPinHover(ev: MouseEvent): void;
  onPinLeave(): void;
  onPinDown(ev: PointerEvent): void;
  onPinMove(ev: PointerEvent): void;
  onPinUp(): void;
  onSectionDragMove(ev: PointerEvent): void;
  /** The lon/lat under a pointer event, or null off the map. */
  invertPointer(ev: MouseEvent): [number, number] | null;
  onTouchStart(ev: Event): void;
}

/** Boundary and fault tooltips follow the pointer, so lift them clear of the cursor. */
export const TIP_LIFT = 10;
/** The pin readout sits above the pin's head, which stands 26 px over the pointer. */
const PIN_TIP_LIFT = 34;
/** How close, in screen pixels, the pointer must come to a fault vertex. */
const FAULT_HIT_PX = 6;

/** Drops the shared basemap and fields caches; for tests. */
export function resetMapCaches(): void {
  resetBasemapCache();
  resetFieldsCache();
}

export function useMapView(opts: MapViewOptions): MapView {
  const { api } = opts;
  const view = computed<MapViewFrame>(() => {
    const r = opts.region();
    const frame = frameFor(r, opts.centre.value);
    return { region: r, frame, path: geoPath(frame.projection), minMag: r.minMag };
  });

  const svgEl = ref<SVGSVGElement | null>(null);
  const cardEl = ref<HTMLElement | null>(null);
  const transform = shallowRef<ZoomTransform>(zoomIdentity);
  const showPlates = ref(true);
  const showTeeth = ref(true);
  const showAurora = ref(false);
  const field = ref<FieldChoice>("none");
  const fields = shallowRef<FieldsFile | null>(null);
  const fieldError = ref(false);
  watch(field, (f) => {
    if (f === "none" || fields.value !== null) return;
    fieldError.value = false;
    loadFields(api)
      .then((file) => {
        fields.value = file;
      })
      .catch(() => {
        fieldError.value = true;
      });
  });
  const fieldAvailable = computed(
    () => !view.value.frame.global || opts.centre.value === DEFAULT_CENTRE,
  );
  const fieldRaster = computed(() =>
    fieldAvailable.value
      ? rasterFor(fields.value, field.value, viewOf(view.value.frame.global))
      : null,
  );
  const section = useSectionTool(opts.section, opts.setSection);
  const pin = usePinTool(opts.pins, () => viewOf(view.value.frame.global));
  const measured = ref<Section | null>(null);
  const ruler = useSectionTool(measured, (s) => {
    measured.value = s;
  });
  const measuring = computed(() => ruler.armed.value || ruler.shown.value !== null);
  const measureText = computed<[string, string] | null>(() => {
    const s = ruler.shown.value;
    const a = ruler.pending.value;
    const b = ruler.cursor.value;
    if (s !== null) return measureLines(measureOf(s.a, s.b));
    return a === null || b === null ? null : measureLines(measureOf(a, b));
  });
  function toggleMeasure(): void {
    if (measuring.value) ruler.clear();
    else ruler.toggle();
  }
  let lastDown: [number, number] | null = null;
  const theater = ref(false);
  /** Escape stands down a tool in use first; with none, it leaves theater mode. */
  function onEscape(ev: KeyboardEvent): void {
    // A side panel shown over the theater takes the Escape first (see DetailPanel).
    if (ev.key !== "Escape" || ev.defaultPrevented) return;
    // Consumed here, so a running tour leaves its own Escape alone.
    ev.preventDefault();
    if (toolBusy.value) {
      section.cancel();
      pin.cancel();
      ruler.cancel();
      tip.value = null;
    } else {
      toggleTheater();
    }
  }
  const toolBusy = computed(
    () => section.armed.value || pin.armed.value || pin.lifted.value || ruler.armed.value,
  );
  const escapable = computed(() => toolBusy.value || theater.value);
  watch(escapable, (on) => {
    if (on) document.addEventListener("keydown", onEscape);
    else document.removeEventListener("keydown", onEscape);
  });
  // One placement at a time: arming any tool stands the others down.
  watch(section.armed, (on) => {
    if (!on) return;
    pin.cancel();
    ruler.cancel();
  });
  watch(pin.armed, (on) => {
    if (on) {
      section.cancel();
      ruler.cancel();
    } else tip.value = null;
  });
  watch(ruler.armed, (on) => {
    if (!on) return;
    section.cancel();
    pin.cancel();
  });
  const coarse = coarsePointer();
  /**
   * When set, wheel, drag and one finger leave the map alone (the page
   * scrolls); buttons, two fingers and zoom-to still work. The map starts
   * locked for every pointer so the page scrolls past it; the lock button
   * frees it.
   */
  const locked = ref(true);
  const cssScale = ref(1);
  /**
   * How the svg's viewBox sits in its box on screen: css pixels per viewBox unit and the offset
   * of the viewBox origin. On the page the box has the frame's aspect and is read by its width; in
   * theater mode the box fills the window and the viewBox covers it (`xMidYMid slice`), centred
   * and cropped on the long side. An unmeasured box (0 wide) counts as one pixel per unit.
   */
  function screenFit(rect: DOMRect): { scale: number; dx: number; dy: number } {
    const { width, height } = view.value.frame;
    if (rect.width === 0) return { scale: 1, dx: 0, dy: 0 };
    if (!theater.value) return { scale: rect.width / width, dx: 0, dy: 0 };
    const scale = Math.max(rect.width / width, rect.height / height);
    return { scale, dx: (rect.width - width * scale) / 2, dy: (rect.height - height * scale) / 2 };
  }
  function measure(): void {
    cssScale.value = screenFit(mustRef(svgEl, "map svg").getBoundingClientRect()).scale;
  }
  const minRadius = computed(() => (coarse ? TOUCH_MIN_RADIUS_PX / cssScale.value : 0));

  /** The lock as it was before theater mode, given back on leaving. */
  let lockBefore = true;
  function toggleTheater(): void {
    theater.value = !theater.value;
    document.body.classList.toggle(IN_THEATER, theater.value);
    if (theater.value) {
      lockBefore = locked.value;
      locked.value = false;
      document.body.style.overflow = "hidden";
    } else {
      locked.value = lockBefore;
      document.body.style.overflow = "";
    }
    void nextTick(measure);
  }
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
  const probe = shallowRef<((lonLat: [number, number]) => string | null) | null>(null);
  /** Whether the tip showing is the probe's, so moving off its layer clears it. */
  let probing = false;
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
    basemap.value = null;
    try {
      const b = await loadBasemapFor(api, r);
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
    const { scale, dx, dy } = screenFit(rect);
    const [x, y] = transform.value.invert([
      (ev.clientX - rect.left - dx) / scale,
      (ev.clientY - rect.top - dy) / scale,
    ]);
    return { x, y, unit: 1 / scale };
  }
  function invertPointer(ev: MouseEvent): [number, number] | null {
    const { x, y } = projectedPointer(ev);
    return invertPoint(view.value.frame.projection, [x, y]);
  }
  function onMapDown(ev: MouseEvent): void {
    lastDown = [ev.clientX, ev.clientY];
  }
  /** How far a press may travel and still count as a click rather than a pan. */
  const CLICK_SLOP_PX = 3;
  function onMapClick(ev: MouseEvent): void {
    if (!section.armed.value && !pin.armed.value && !ruler.armed.value) return;
    const down = lastDown;
    if (down !== null && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > CLICK_SLOP_PX) {
      return;
    }
    const ll = invertPointer(ev);
    if (ll === null) return;
    if (pin.armed.value) pin.place(ll);
    else if (ruler.armed.value) ruler.place(ll);
    else section.place(ll);
  }
  /** The live readout beside the pointer while the pin is placed or moved. */
  function pinReadout(ev: MouseEvent, ll: [number, number] | null, verb: string): void {
    if (ll === null) tip.value = null;
    else showTip(`${fmtLatLon(ll[0], ll[1])} · ${verb}`, ev.clientX, ev.clientY - PIN_TIP_LIFT);
  }
  function onPinHover(ev: MouseEvent): void {
    const p = pin.pin.value;
    if (p === null || pin.lifted.value) return;
    showTip(pinTitle(p), ev.clientX, ev.clientY - PIN_TIP_LIFT);
  }
  function onPinLeave(): void {
    if (!pin.lifted.value) tip.value = null;
  }
  function onPinDown(ev: PointerEvent): void {
    pin.press([ev.clientX, ev.clientY]);
  }
  function onPinMove(ev: PointerEvent): void {
    const ll = invertPointer(ev);
    pin.pressMove([ev.clientX, ev.clientY], ll);
    if (pin.lifted.value) pinReadout(ev, ll, "release to set down");
    else onPinHover(ev);
  }
  function onPinUp(): void {
    pin.release();
    tip.value = null;
  }
  function onMeasureDragMove(ev: PointerEvent): void {
    const ll = invertPointer(ev);
    if (ll !== null) ruler.dragMove(ll);
  }
  function onSectionDragMove(ev: PointerEvent): void {
    const ll = invertPointer(ev);
    if (ll !== null) section.dragMove(ll);
  }
  /** Fault traces have no hit paths of their own; the svg looks one up under the pointer. */
  function onMapMove(ev: MouseEvent): void {
    if (section.armed.value) section.hover(invertPointer(ev));
    if (ruler.armed.value) ruler.hover(invertPointer(ev));
    if (pin.armed.value) {
      const ll = invertPointer(ev);
      pin.hover(ll);
      pinReadout(ev, ll, "click to place");
      return;
    }
    const target = ev.target;
    // Markers and boundaries show their own tips.
    if (target instanceof Element && target.closest("[data-hit]") !== null) {
      probing = false;
      return;
    }
    if (faultAt(ev)) probing = false;
    else probeAt(ev);
  }
  /** Shows the Quaternary fault under the pointer; false when none is near. */
  function faultAt(ev: MouseEvent): boolean {
    if (!faultsOn.value || visibleFaults.value.length === 0) return false;
    const { x, y, unit } = projectedPointer(ev);
    const hit = faultIdx.value.nearest(x, y, (FAULT_HIT_PX * unit) / transform.value.k);
    if (hit === null) {
      if (hoveredFault.value !== null) {
        hoveredFault.value = null;
        tip.value = null;
      }
      return false;
    }
    hoveredFault.value = hit;
    showTip(faultTitle(hit.feature.properties), ev.clientX, ev.clientY - TIP_LIFT);
    return true;
  }
  /** A page layer's readout for the point under the pointer, when it has one there. */
  function probeAt(ev: MouseEvent): void {
    const read = probe.value;
    const ll = read === null ? null : invertPointer(ev);
    const text = read === null || ll === null ? null : read(ll);
    if (text !== null) {
      probing = true;
      showTip(text, ev.clientX, ev.clientY - TIP_LIFT);
    } else if (probing) {
      probing = false;
      tip.value = null;
    }
  }
  function onMapLeave(): void {
    if (pin.armed.value) {
      pin.hover(null);
      tip.value = null;
    }
    if (probing) {
      probing = false;
      tip.value = null;
    }
    if (hoveredFault.value === null) return;
    hoveredFault.value = null;
    tip.value = null;
  }

  watch(
    () => view.value.region,
    (r) => {
      reset();
      pin.cancel();
      void loadBasemap(r);
    },
  );
  // A new centre re-projects the map; keep the zoom and the place under the middle of the view.
  watch(view, (v, old) => {
    if (v.region !== old.region) return;
    const t = transform.value;
    if (t.k === 1 && t.x === 0 && t.y === 0) return;
    const { width, height } = v.frame;
    const ll = invertPoint(old.frame.projection, t.invert([width / 2, height / 2]));
    if (ll === null) {
      zoomBehavior.transform(svgSelection(), zoomIdentity);
      return;
    }
    const [x, y] = projectPoint(v.frame.projection, ll);
    zoomBehavior.transform(
      svgSelection(),
      zoomIdentity.translate(width / 2 - t.k * x, height / 2 - t.k * y).scale(t.k),
    );
  });
  onMounted(() => {
    document.addEventListener("mousedown", closePickOnOutside);
    window.addEventListener("resize", measure);
    measure();
    svgSelection().call(zoomBehavior).on("dblclick.zoom", null);
    void loadBasemap(view.value.region);
    void loadPlates();
  });
  onUnmounted(() => {
    document.removeEventListener("keydown", onEscape);
    document.removeEventListener("mousedown", closePickOnOutside);
    pin.cancel();
    window.removeEventListener("resize", measure);
    if (theater.value) {
      document.body.style.overflow = "";
      document.body.classList.remove(IN_THEATER);
    }
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
    showAurora,
    field,
    fieldRaster,
    fieldAvailable,
    fieldError,
    centre: opts.centre,
    setCentre: opts.setCentre,
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
    setTransform: applyTransform,
    zoomTo,
    showTip,
    clearTip,
    toggleLock,
    setAllFaults,
    onPlateHover,
    onPlateLeave,
    onMapMove,
    onMapLeave,
    onMapDown,
    onMapClick,
    onSectionDragMove,
    measure: ruler,
    measuring,
    measureText,
    toggleMeasure,
    theater,
    toggleTheater,
    onMeasureDragMove,
    invertPointer,
    section,
    pin,
    probe,
    onPinHover,
    onPinLeave,
    onPinDown,
    onPinMove,
    onPinUp,
    onTouchStart,
  };
}
