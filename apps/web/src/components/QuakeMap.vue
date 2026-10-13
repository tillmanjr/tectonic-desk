<script setup lang="ts">
import type { ApiEvent, ApiRegion } from "@tectonic/shared";
import { geoPath } from "d3-geo";
import { select as d3select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import type { Feature, LineString } from "geojson";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import MapBasemap from "./MapBasemap.vue";
import MapEvents from "./MapEvents.vue";
import MapLegend from "./MapLegend.vue";
import MapPlates from "./MapPlates.vue";
import MapTeeth from "./MapTeeth.vue";
import MapTooltip from "./MapTooltip.vue";
import { mustRef } from "../lib/dom.js";
import { fmtMag, placeOf } from "../lib/format.js";
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
import { API, CATALOG, SELECT, useInjected } from "../lib/keys.js";
import type { Tip } from "../lib/tip.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const { events, selectedId, selected } = catalog;
const select = useInjected(SELECT);

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

function showTip(text: string, x: number, y: number): void {
  const card = mustRef(cardEl, "map card").getBoundingClientRect();
  tip.value = { text, x: x - card.left, y: y - card.top };
}
function onHover(payload: { e: ApiEvent; x: number; y: number }): void {
  const { e } = payload;
  const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
  const type = e.magType === null ? "" : ` ${e.magType}`;
  showTip(`M${fmtMag(e.mag)}${type} · ${depth} km · ${placeOf(e)}`, payload.x, payload.y);
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
      <span class="sp"></span>
      <label
        title="Wheel and drag scroll the page instead of moving the map; the buttons and clicking an event still zoom"
        ><input v-model="locked" type="checkbox" /> Lock map</label
      >
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
    </div>
    <svg
      ref="svgEl"
      class="map"
      :class="{ locked }"
      role="img"
      aria-label="Map of earthquake epicenters"
      :viewBox="`0 0 ${String(view.frame.width)} ${String(view.frame.height)}`"
    >
      <g :transform="transform.toString()">
        <MapBasemap :frame="view.frame" :path="view.path" :basemap="basemap" />
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
          :events="events"
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
    <MapTooltip :tip="tip" />
    <MapLegend :frame="view.frame" :min-mag="view.minMag" />
  </section>
</template>
