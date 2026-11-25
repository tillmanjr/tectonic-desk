<script setup lang="ts">
import { geoGraticule, geoOrthographic, geoPath } from "d3-geo";
import type { FeatureCollection, LineString } from "geojson";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { loadGlobeLandOnce } from "../lib/basemap-cache.js";
import {
  CENTRE_NUDGE,
  DEFAULT_CENTRE,
  fmtLon,
  lonOfOffset,
  offsetOf,
  snapOffset,
  wrapLon,
} from "../lib/centre.js";
import { mustRef } from "../lib/dom.js";
import { pathOf } from "../lib/geo.js";
import { vHint } from "../lib/hint.js";
import type { MapView } from "../lib/mapview.js";

/**
 * The global map's Centre control, over the map's bottom-left corner: ‹ › turn it by 15°, the slider runs 180° either side of 150°E
 * with a detent there, ↺ goes back. While the control is in use a small globe turns with it; the map
 * re-projects when the slider is let go.
 */
const props = defineProps<{ mv: MapView }>();
const { mv } = props;

/** Globe size in px. */
const GLOBE = 132;

const draft = ref(offsetOf(mv.centre.value));
watch(mv.centre, (lon) => {
  draft.value = offsetOf(lon);
});
const draftLon = computed(() => lonOfOffset(draft.value));

const root = ref<HTMLElement | null>(null);
const focused = ref(false);
const pressing = ref(false);
const shown = computed(() => focused.value || pressing.value);
// The map card clips its contents, so the globe lives on the body, fixed beside the control: to
// its right, bottoms level, clear of the hint that opens above or below it.
const place = ref({ x: 0, y: 0 });
watch(shown, (on) => {
  if (!on) return;
  const r = mustRef(root, "centre control").getBoundingClientRect();
  place.value = { x: r.right + 8, y: r.bottom };
  void loadLand();
});

const land = shallowRef<FeatureCollection | null>(null);
async function loadLand(): Promise<void> {
  if (land.value !== null) return;
  try {
    land.value = await loadGlobeLandOnce();
  } catch (e) {
    console.error("globe land failed to load", e);
  }
}

function meridian(lon: number): LineString {
  const coordinates: [number, number][] = [];
  for (let lat = -90; lat <= 90; lat += 5) coordinates.push([lon, lat]);
  return { type: "LineString", coordinates };
}
const graticule = geoGraticule().step([30, 30])();
const globe = computed(() => {
  const projection = geoOrthographic()
    .rotate([-draftLon.value, -20])
    .fitExtent(
      [
        [3, 3],
        [GLOBE - 3, GLOBE - 3],
      ],
      { type: "Sphere" },
    );
  const path = geoPath(projection);
  return {
    sphere: pathOf(path, { type: "Sphere" }),
    graticule: pathOf(path, graticule),
    land: land.value === null ? "" : pathOf(path, land.value),
    home: pathOf(path, meridian(DEFAULT_CENTRE)),
    now: pathOf(path, meridian(draftLon.value)),
  };
});

const slider = ref<HTMLInputElement | null>(null);
function onInput(): void {
  const el = mustRef(slider, "centre slider");
  const v = Number(el.value);
  // The detent catches a drag only; arrow keys step through it.
  draft.value = pressing.value ? snapOffset(v) : v;
  el.value = String(draft.value);
}
function commit(): void {
  if (draftLon.value !== mv.centre.value) mv.setCentre(draftLon.value);
}
function nudge(by: number): void {
  mv.setCentre(wrapLon(mv.centre.value + by));
}
function onFocusOut(e: FocusEvent): void {
  if (e.relatedTarget instanceof Node && root.value?.contains(e.relatedTarget) === true) return;
  focused.value = false;
}
function onPointerUp(): void {
  pressing.value = false;
  document.removeEventListener("pointerup", onPointerUp);
}
function onPointerDown(): void {
  pressing.value = true;
  document.addEventListener("pointerup", onPointerUp);
}
onBeforeUnmount(() => {
  document.removeEventListener("pointerup", onPointerUp);
});
</script>

<template>
  <div
    ref="root"
    class="centrepick"
    :class="{ active: shown }"
    data-tour="map.centre"
    @focusin="focused = true"
    @focusout="onFocusOut"
    @pointerdown="onPointerDown"
  >
    <span
      v-hint="
        'The longitude the global map is centred on, 150°E by default. The map follows the slider when you let go, keeping your zoom; field overlays draw at 150°E only.'
      "
      class="clabel"
      >Centre</span
    >
    <button
      v-hint="'Turn the map 15° west'"
      type="button"
      class="cnudge"
      aria-label="Turn the map west"
      @click="nudge(-CENTRE_NUDGE)"
    >
      ‹
    </button>
    <span class="ctrack">
      <input
        ref="slider"
        v-hint="'Drag to turn the map; it catches at 150°E'"
        type="range"
        min="-179"
        max="180"
        step="1"
        :value="draft"
        aria-label="Map centre longitude"
        :aria-valuetext="fmtLon(draftLon)"
        @input="onInput"
        @change="commit"
      />
    </span>
    <button
      v-hint="'Turn the map 15° east'"
      type="button"
      class="cnudge"
      aria-label="Turn the map east"
      @click="nudge(CENTRE_NUDGE)"
    >
      ›
    </button>
    <span class="cvalue">{{ fmtLon(draftLon) }}</span>
    <button
      v-hint="'Back to 150°E, the default'"
      type="button"
      class="cnudge"
      aria-label="Centre the map on 150°E"
      :disabled="mv.centre.value === DEFAULT_CENTRE"
      @click="mv.setCentre(DEFAULT_CENTRE)"
    >
      ↺
    </button>
    <Teleport to="body">
      <div
        v-if="shown"
        class="cglobe"
        :style="{ left: `${String(place.x)}px`, top: `${String(place.y)}px` }"
        aria-hidden="true"
      >
        <svg :width="GLOBE" :height="GLOBE" :viewBox="`0 0 ${String(GLOBE)} ${String(GLOBE)}`">
          <path class="gsea" :d="globe.sphere" />
          <path class="ggrat" :d="globe.graticule" />
          <path class="gland" :d="globe.land" />
          <path class="ghome" :d="globe.home" />
          <path class="gnow" :d="globe.now" />
          <path class="grim" :d="globe.sphere" />
        </svg>
        <span class="gcap"
          ><b>{{ fmtLon(draftLon) }}</b> · default {{ fmtLon(DEFAULT_CENTRE) }}</span
        >
      </div>
    </Teleport>
  </div>
</template>
