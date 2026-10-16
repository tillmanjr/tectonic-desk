<script setup lang="ts">
import type { ApiEvent, ApiRegion } from "@tectonic/shared";
import { geoPath } from "d3-geo";
import { select as d3select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import type { Feature, LineString } from "geojson";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import MapBasemap from "./MapBasemap.vue";
import MapEvents from "./MapEvents.vue";
import MapFaults from "./MapFaults.vue";
import MapLegend from "./MapLegend.vue";
import MapPlates from "./MapPlates.vue";
import MapTeeth from "./MapTeeth.vue";
import MapTooltip from "./MapTooltip.vue";
import { createAnimation, DAY_MS } from "../lib/animation.js";
import { mustRef } from "../lib/dom.js";
import {
  AGE_CODES,
  FAULT_AGES,
  faultFeatures,
  faultIndex,
  faultTitle,
  type AgeCode,
  type FaultFeature,
  type FaultHit,
} from "../lib/faults.js";
import { fmtMag, fmtShort, fmtStamp, placeOf } from "../lib/format.js";
import {
  frameFor,
  loadWorld,
  plateFeature,
  regionBasemap,
  worldBasemap,
  type Basemap,
  type PlateProps,
  type PlateSegment,
  type Topo,
  zoomTransformFor,
} from "../lib/geo.js";
import { API, CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import type { Tip } from "../lib/tip.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const { filtered: events, selectedId, selected } = catalog;
const select = useInjected(SELECT);
const zone = useInjected(ZONE);
const clock = useInjected(CLOCK);

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
/** The overlay line: how many of the window's events the refinements leave on the map. */
const countLine = computed(
  () =>
    `Showing ${String(events.value.length)} of ${String(catalog.windowEvents.value.length)} events`,
);
/** What the map draws: everything, or only what has happened by the animation cursor. */
const shown = computed(() => {
  const c = anim.cursor.value;
  if (c === null) return events.value;
  const t = c.getTime();
  return events.value.filter((e) => Date.parse(e.time) <= t);
});
function openAnimation(): void {
  anim.open(windowBounds.value.start, windowBounds.value.end, zone.value);
}
function togglePlay(): void {
  if (anim.playing.value) anim.pause();
  else anim.play();
}
onUnmounted(() => {
  document.removeEventListener("mousedown", closePickOnOutside);
  anim.close();
});

const view = computed(() => {
  const r = catalog.requireRegion();
  const frame = frameFor(r);
  return { region: r, frame, path: geoPath(frame.projection), minMag: r.minMag };
});

const svgEl = ref<SVGSVGElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);
const transform = shallowRef<ZoomTransform>(zoomIdentity);
const showMech = ref(true);
const showPlates = ref(true);
const showTeeth = ref(true);
/** When set, wheel, drag and touch leave the map alone (the page scrolls); buttons and zoom-to-event still work. */
const locked = ref(true);
const plateSegments = shallowRef<PlateSegment[]>([]);
const plates = shallowRef<Feature<LineString, PlateProps>[]>([]);
const basemap = shallowRef<Basemap | null>(null);
const tip = ref<Tip | null>(null);
const hoveredPlate = ref<number | null>(null);
/** Which age classes of Quaternary faults are drawn; empty means none. */
const faultAges = ref<AgeCode[]>([...AGE_CODES]);
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
const faultSummary = computed(() => {
  const n = faultAges.value.length;
  if (n === AGE_CODES.length) return "All";
  return n === 0 ? "None" : `${String(n)} of ${String(AGE_CODES.length)}`;
});
function closePickOnOutside(ev: MouseEvent): void {
  const t = ev.target;
  if (t instanceof Element && t.closest(".layerpick") !== null) return;
  pickOpen.value = false;
}

const zoomBehavior = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 40]);
const defaultFilter = zoomBehavior.filter();
zoomBehavior
  .filter(function (this: SVGSVGElement, ev: Event, d: unknown) {
    return !locked.value && defaultFilter.call(this, ev, d);
  })
  .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
    transform.value = ev.transform;
  });

function svgSelection() {
  return d3select(mustRef(svgEl, "map svg"));
}
function applyTransform(t: ZoomTransform): void {
  const sel = svgSelection();
  if (props.animate) {
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
  if (props.animate) {
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
function zoomTo(e: ApiEvent): void {
  applyTransform(zoomTransformFor(view.value.frame, e.longitude, e.latitude));
}

let worldTopo: Topo | null = null;
const regionCache = new Map<string, Basemap>();
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
function onHover(payload: { e: ApiEvent; x: number; y: number }): void {
  const { e } = payload;
  const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
  const type = e.magType === null ? "" : ` ${e.magType}`;
  showTip(
    `M${fmtMag(e.mag)}${type} · ${depth} km · ${placeOf(e)} · ${fmtShort(e.time, zone.value)}`,
    payload.x,
    payload.y,
  );
}
/** Boundary tooltips follow the pointer, so lift them clear of the cursor. */
const PLATE_TIP_LIFT = 10;
function onPlateHover(payload: { index: number; title: string; x: number; y: number }): void {
  hoveredPlate.value = payload.index;
  showTip(payload.title, payload.x, payload.y - PLATE_TIP_LIFT);
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
/** How close, in screen pixels, the pointer must come to a fault vertex. */
const FAULT_HIT_PX = 6;
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
  showTip(faultTitle(hit.feature.properties), ev.clientX, ev.clientY - PLATE_TIP_LIFT);
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
watch(selected, (e) => {
  if (e !== null) zoomTo(e);
});
onMounted(() => {
  document.addEventListener("mousedown", closePickOnOutside);
  svgSelection().call(zoomBehavior).on("dblclick.zoom", null);
  void loadBasemap(view.value.region);
  void loadPlates();
});
</script>

<template>
  <section ref="cardEl" class="mapcard">
    <div class="maptools">
      <label><input v-model="showMech" type="checkbox" /> Focal mechanisms</label>
      <label><input v-model="showPlates" type="checkbox" /> Plate boundaries</label>
      <label><input v-model="showTeeth" type="checkbox" /> Subduction teeth</label>
      <div v-if="hasFaults" class="layerpick">
        <button
          type="button"
          class="zbtn pickbtn"
          aria-haspopup="true"
          :aria-expanded="pickOpen"
          @click="pickOpen = !pickOpen"
        >
          Quaternary faults: {{ faultSummary }} ▾
        </button>
        <div v-if="pickOpen" class="pickmenu" role="group" aria-label="Quaternary fault ages">
          <label v-for="(a, code) in FAULT_AGES" :key="code">
            <input v-model="faultAges" type="checkbox" :value="code" />
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" :style="{ stroke: a.color }" stroke-width="2" />
            </svg>
            {{ a.label }}
          </label>
          <div class="pickrow">
            <button type="button" @click="faultAges = [...AGE_CODES]">All</button>
            <button type="button" @click="faultAges = []">None</button>
          </div>
        </div>
      </div>
      <span class="sp"></span>
      <button type="button" class="zbtn" aria-label="Zoom in" @click="scaleBy(1.8)">+</button>
      <button type="button" class="zbtn" aria-label="Zoom out" @click="scaleBy(1 / 1.8)">−</button>
      <button
        type="button"
        class="zbtn"
        aria-label="Reset view"
        style="width: auto; padding: 0 8px"
        @click="reset"
      >
        Reset
      </button>
      <button
        type="button"
        class="zbtn"
        style="width: auto; padding: 0 8px"
        :aria-pressed="anim.active.value"
        title="Replay the loaded window on the map, day by day"
        @click="anim.active.value ? anim.close() : openAnimation()"
      >
        Animate
      </button>
    </div>
    <div v-if="anim.active.value && anim.cursor.value !== null" class="animbar">
      <label
        >Seconds per day
        <input v-model.number="anim.secondsPerDay.value" type="number" min="0.1" step="0.5" />
      </label>
      <button type="button" class="zbtn" aria-label="Back one day" @click="anim.stepDay(-1)">
        ◀
      </button>
      <button
        type="button"
        class="zbtn play"
        :aria-label="anim.playing.value ? 'Pause' : 'Start'"
        @click="togglePlay"
      >
        {{ anim.playing.value ? "Pause" : "Start" }}
      </button>
      <button type="button" class="zbtn" aria-label="Forward one day" @click="anim.stepDay(1)">
        ▶
      </button>
      <span class="animclock num">{{ fmtStamp(anim.cursor.value.toISOString(), zone) }}</span>
      <span class="animcount">{{ shown.length }} of {{ events.length }} events</span>
      <span class="sp"></span>
      <button type="button" class="zbtn" style="width: auto; padding: 0 8px" @click="anim.close()">
        Close
      </button>
    </div>
    <div class="mapwrap">
      <span class="mapcount" aria-live="polite">{{ countLine }}</span>
      <button
        type="button"
        class="maplock"
        :aria-pressed="locked"
        aria-label="Lock map"
        :title="
          locked
            ? 'Map locked: wheel and drag scroll the page. Click to pan and zoom by hand.'
            : 'Map unlocked: wheel and drag move the map. Click to lock it.'
        "
        @click="locked = !locked"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
          <rect
            x="10"
            y="5"
            width="12"
            height="22"
            rx="6"
            :style="{ fill: locked ? 'var(--muted)' : 'var(--ink)' }"
          />
          <line x1="16" y1="5" x2="16" y2="13" stroke="var(--panel)" stroke-width="1.5" />
          <rect x="15" y="8" width="2" height="4" rx="1" fill="var(--panel)" />
          <g v-if="locked" class="slash">
            <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--muted)" stroke-width="2.2" />
            <line x1="5.8" y1="5.8" x2="26.2" y2="26.2" stroke="var(--muted)" stroke-width="2.2" />
          </g>
        </svg>
      </button>
      <svg
        ref="svgEl"
        class="map"
        :class="{ locked }"
        role="img"
        aria-label="Map of earthquake epicenters"
        :viewBox="`0 0 ${String(view.frame.width)} ${String(view.frame.height)}`"
        @mousemove="onMapMove"
        @mouseleave="onMapLeave"
      >
        <g :transform="transform.toString()">
          <MapBasemap :frame="view.frame" :path="view.path" :basemap="basemap" />
          <MapFaults
            v-if="faultsOn"
            :path="view.path"
            :features="visibleFaults"
            :hovered="hoveredFault === null ? null : hoveredFault.feature"
          />
          <MapPlates
            v-if="showPlates"
            :path="view.path"
            :features="plates"
            @hover="onPlateHover"
            @leave="onPlateLeave"
          />
          <MapTeeth
            v-if="showTeeth"
            :frame="view.frame"
            :segments="plateSegments"
            :k="transform.k"
            :highlight="hoveredPlate"
          />
          <MapEvents
            :frame="view.frame"
            :events="shown"
            :k="transform.k"
            :selected-id="selectedId"
            :show-mech="showMech"
            :min-mag="view.minMag"
            @select="select"
            @hover="onHover"
            @leave="tip = null"
          />
        </g>
      </svg>
    </div>
    <MapTooltip :tip="tip" />
    <MapLegend :frame="view.frame" :min-mag="view.minMag" :faults="hasFaults ? faultAges : []" />
  </section>
</template>
