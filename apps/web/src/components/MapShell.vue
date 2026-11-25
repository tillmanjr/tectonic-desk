<script setup lang="ts">
import DiveMark from "./DiveMark.vue";
import { computed, inject, onBeforeUnmount, onMounted, watch } from "vue";
import MapAurora from "./MapAurora.vue";
import MapBasemap from "./MapBasemap.vue";
import MapCentre from "./MapCentre.vue";
import MapFaults from "./MapFaults.vue";
import MapField from "./MapField.vue";
import MapLegend from "./MapLegend.vue";
import MapMeasure from "./MapMeasure.vue";
import MapPin from "./MapPin.vue";
import MapPlates from "./MapPlates.vue";
import MapSection from "./MapSection.vue";
import MapTeeth from "./MapTeeth.vue";
import MapTooltip from "./MapTooltip.vue";
import PinBar from "./PinBar.vue";
import type { AuroraLegend } from "../lib/aurora-map.js";
import type { DensityLegend } from "../lib/density.js";
import { AGE_CODES, FAULT_AGES } from "../lib/faults.js";
import { FIELD_CHOICES, viewOf } from "../lib/fields.js";
import { fmtClock } from "../lib/format.js";
import { vHint } from "../lib/hint.js";
import { AURORA, useInjected, ZONE } from "../lib/keys.js";
import type { MapView } from "../lib/mapview.js";
import { TOUR } from "../lib/tour.js";

/**
 * The card around a map: toolbar with the shared layer toggles and zoom
 * buttons, the lock, the svg with basemap, faults, plates and teeth, the
 * tooltip, touch hint and legend. Pages add their own toggles in `tools`,
 * their markers in `layers`, extra buttons in `actions`, a strip in `bar`
 * and legend rows in `legend`.
 */
const props = withDefaults(
  defineProps<{
    mv: MapView;
    label: string;
    countLine: string;
    /** Whether the legend carries the earthquake rows; a page without events turns them off. */
    quakes?: boolean;
    /** The density shading in force, passed to the legend; null when none is drawn. */
    density?: DensityLegend | null;
    /** The magnitude floor the legend's size key is scaled from; null uses the view's own. */
    floor?: number | null;
    /** Whether the Section tool and its line are offered; the Volcanoes page has no profile. */
    sectionTool?: boolean;
    /** What the page is fetching, shown over the map while the markers dim; null when settled. */
    busy?: string | null;
  }>(),
  { quakes: true, density: null, floor: null, sectionTool: true, busy: null },
);
const { mv } = props;
const aurora = useInjected(AURORA);
const zone = useInjected(ZONE);
// A running tour reaches this map through the runner while it is on screen.
const tour = inject(TOUR, null);
onMounted(() => {
  tour?.attachMap(mv);
});
onBeforeUnmount(() => {
  tour?.detachMap(mv);
});

// The aurora layer holds the shared store running while its toggle is on.
watch(
  () => mv.showAurora.value,
  (on) => {
    if (on) {
      aurora.start();
    } else {
      aurora.stop();
    }
  },
);
onBeforeUnmount(() => {
  if (mv.showAurora.value) aurora.stop();
});
const auroraLegend = computed<AuroraLegend | null>(() => {
  if (!mv.showAurora.value) return null;
  const f = aurora.frame.value;
  return { time: f === null ? null : fmtClock(f.forecast, zone.value), error: aurora.error.value };
});
</script>

<template>
  <section :ref="mv.cardEl" class="mapcard" data-tour="map" :class="{ theater: mv.theater.value }">
    <div class="maptools" data-tour="map.tools">
      <slot name="tools"></slot>
      <label
        v-hint="
          'Draws the PB2002 plate boundaries (Bird 2003), coloured by boundary class. Hover a segment for the plate pair and its class.'
        "
        data-tour="map.layers"
        ><input v-model="mv.showPlates.value" type="checkbox" /> Plate boundaries</label
      >
      <label
        v-hint="
          'Adds teeth along the PB2002 subduction boundaries, on the overriding plate and pointing down-dip. Drawn whether or not the boundaries are on.'
        "
        data-tour="map.layers"
        ><input v-model="mv.showTeeth.value" type="checkbox" /> Subduction teeth</label
      >
      <label
        v-hint="
          'Overlays the latest NOAA SWPC OVATION Prime aurora forecast as probability bands, drawn on the night side only. Refreshes about every five minutes while on.'
        "
        data-tour="map.layers"
        ><input v-model="mv.showAurora.value" type="checkbox" /> Aurora</label
      >
      <div v-if="mv.hasFaults.value" class="layerpick" data-tour="map.layers map.faults">
        <label
          v-hint="
            'Draws USGS Quaternary Fault and Fold Database traces, styled by age of most recent deformation and by location certainty. Hover a trace for its name and slip sense.'
          "
          ><input
            type="checkbox"
            :checked="mv.faultsAll.value"
            :indeterminate="mv.faultsPartial.value"
            aria-label="Quaternary faults"
            @change="mv.setAllFaults"
          />
          Quaternary faults<span v-if="mv.faultsPartial.value" class="pickcount">{{
            mv.faultCount.value
          }}</span></label
        >
        <button
          v-hint="'Choose which Quaternary faults to show, by age of most recent deformation'"
          type="button"
          class="pickopen"
          aria-label="Choose which Quaternary faults to show"
          aria-haspopup="true"
          :aria-expanded="mv.pickOpen.value"
          @click="mv.pickOpen.value = !mv.pickOpen.value"
        >
          ▾
        </button>
        <div
          v-if="mv.pickOpen.value"
          class="pickmenu"
          role="group"
          aria-label="Quaternary fault ages"
        >
          <label v-for="(a, code) in FAULT_AGES" :key="code">
            <input v-model="mv.faultAges.value" type="checkbox" :value="code" />
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" :style="{ stroke: a.color }" stroke-width="2" />
            </svg>
            {{ a.label }}
          </label>
          <div class="pickrow">
            <button type="button" @click="mv.faultAges.value = [...AGE_CODES]">All</button>
            <button type="button" @click="mv.faultAges.value = []">None</button>
          </div>
        </div>
      </div>
      <label
        v-hint="
          mv.fieldAvailable.value
            ? 'Underlays a potential-field anomaly grid: free-air gravity (isostatic residual onshore in the West Coast view) or the EMAG2v3 total-field magnetic anomaly. The legend gives the source and the colour ramp.'
            : 'The field grids are drawn for the map centred on 150°E only. Turn the Centre back to 150°E (↺) to see them; your choice is kept.'
        "
        class="fieldpick"
        data-tour="map.field"
        >Field
        <select
          v-model="mv.field.value"
          aria-label="Field overlay"
          :disabled="!mv.fieldAvailable.value"
        >
          <option v-for="c in FIELD_CHOICES" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <span v-if="mv.fieldError.value" class="fielderr">unavailable</span>
      </label>
      <button
        v-if="sectionTool"
        v-hint="
          'Draws a cross-section line: click two points on the map, then drag either end to adjust. The profile under the map plots the events inside the corridor at true scale.'
        "
        type="button"
        class="sectionbtn"
        data-tour="map.section"
        :aria-pressed="mv.section.armed.value"
        @click="mv.section.toggle()"
      >
        Section
      </button>
      <button
        v-hint="
          'Measures between two points: click both on the map, then drag either end. Reads the angular distance Δ and surface (great-circle) distance, and the straight chord through the Earth with how deep its midpoint dips and the PREM layer there. Spherical Earth, 6371 km; within about 0.5 % of the WGS84 geodesic. Click again to clear.'
        "
        type="button"
        class="sectionbtn measurebtn"
        data-tour="map.measure"
        :aria-pressed="mv.measuring.value"
        @click="mv.toggleMeasure()"
      >
        Measure
      </button>
      <button
        v-hint="
          'Drops your own pin on this map view (one each for Global and West Coast), kept in this browser. Click the map to place it; press and hold the pin to move it. The bar lists recent placements.'
        "
        type="button"
        class="sectionbtn pinbtn"
        data-tour="map.pin"
        :aria-pressed="mv.pin.open.value"
        @click="mv.pin.toggle()"
      >
        <svg width="10" height="14" viewBox="-10 -27 20 28" aria-hidden="true">
          <path
            class="pbody"
            d="M0,0 C-1.5,-6 -9,-10.5 -9,-17 A9,9 0 1 1 9,-17 C9,-10.5 1.5,-6 0,0 Z"
          />
          <circle class="pcore" cx="0" cy="-17" r="3.6" />
        </svg>
        Pin
      </button>
      <span class="sp"></span>
      <button
        v-hint="'Zoom in on the centre of the map'"
        type="button"
        class="zbtn"
        data-tour="map.zoom"
        aria-label="Zoom in"
        @click="mv.scaleBy(1.8)"
      >
        +
      </button>
      <button
        v-hint="'Zoom out from the centre of the map'"
        type="button"
        class="zbtn"
        data-tour="map.zoom"
        aria-label="Zoom out"
        @click="mv.scaleBy(1 / 1.8)"
      >
        −
      </button>
      <button
        v-hint="'Return to the full view of the region'"
        type="button"
        class="zbtn"
        data-tour="map.zoom"
        aria-label="Reset view"
        style="width: auto; padding: 0 8px"
        @click="mv.reset()"
      >
        Reset
      </button>
      <slot name="actions"></slot>
      <DiveMark area="Map" />
    </div>
    <PinBar
      v-if="mv.pin.open.value"
      data-tour="map.pinbar"
      :tool="mv.pin"
      :view="viewOf(mv.view.value.frame.global)"
    />
    <slot name="bar"></slot>
    <div class="mapstage" data-tour="map.stage">
      <div class="mapwrap">
        <span class="mapcount" aria-live="polite" data-tour="map.count">{{ countLine }}</span>
        <button
          v-hint="
            mv.theater.value
              ? 'Back to the page (Esc)'
              : 'Theater mode: the map and its toolbar fill the browser window, with everything else set aside until you leave (this button or Esc). The map unlocks while in it, so wheel and drag move it.'
          "
          type="button"
          class="theaterbtn"
          data-tour="map.theater"
          :aria-pressed="mv.theater.value"
          :aria-label="mv.theater.value ? 'Exit theater mode' : 'Theater mode'"
          @click="mv.toggleTheater()"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              v-if="!mv.theater.value"
              d="M2,7 V2 H7 M13,2 H18 V7 M18,13 V18 H13 M7,18 H2 V13"
            />
            <path v-else d="M7,2 V7 H2 M18,7 H13 V2 M13,18 V13 H18 M2,13 H7 V18" />
          </svg>
        </button>

        <MapCentre v-if="mv.view.value.frame.global" :mv="mv" />
        <span v-if="busy !== null" class="mapbusy" role="status"
          ><span class="spin" aria-hidden="true"></span>{{ busy }}</span
        >
        <button
          v-hint="
            mv.locked.value
              ? 'Map locked: wheel and drag scroll the page. Click to pan and zoom by hand.'
              : 'Map unlocked: wheel and drag move the map. Click to lock it.'
          "
          type="button"
          class="maplock"
          data-tour="map.lock"
          :aria-pressed="mv.locked.value"
          aria-label="Lock map"
          @click="mv.toggleLock()"
        >
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <rect
              x="10"
              y="5"
              width="12"
              height="22"
              rx="6"
              :style="{ fill: mv.locked.value ? 'var(--muted)' : 'var(--ink)' }"
            />
            <line x1="16" y1="5" x2="16" y2="13" stroke="var(--panel)" stroke-width="1.5" />
            <rect x="15" y="8" width="2" height="4" rx="1" fill="var(--panel)" />
            <g v-if="mv.locked.value" class="slash">
              <circle
                cx="16"
                cy="16"
                r="14.5"
                fill="none"
                stroke="var(--muted)"
                stroke-width="2.2"
              />
              <line
                x1="5.8"
                y1="5.8"
                x2="26.2"
                y2="26.2"
                stroke="var(--muted)"
                stroke-width="2.2"
              />
            </g>
          </svg>
        </button>
        <svg
          :ref="mv.svgEl"
          class="map"
          role="img"
          :aria-label="label"
          :viewBox="`0 0 ${String(mv.view.value.frame.width)} ${String(mv.view.value.frame.height)}`"
          :preserveAspectRatio="mv.theater.value ? 'xMidYMid slice' : undefined"
          :class="{
            locked: mv.locked.value,
            arming: mv.section.armed.value || mv.pin.armed.value || mv.measure.armed.value,
            busy: busy !== null,
          }"
          @mousemove="mv.onMapMove"
          @mouseleave="mv.onMapLeave()"
          @mousedown="mv.onMapDown"
          @click="mv.onMapClick"
          @touchstart.passive="mv.onTouchStart"
        >
          <g :transform="mv.transform.value.toString()">
            <MapBasemap
              :frame="mv.view.value.frame"
              :path="mv.view.value.path"
              :basemap="mv.basemap.value"
            />
            <MapField
              v-if="mv.fieldRaster.value !== null"
              :raster="mv.fieldRaster.value"
              :frame="mv.view.value.frame"
            />
            <MapAurora
              v-if="mv.showAurora.value && aurora.frame.value !== null"
              :path="mv.view.value.path"
              :bands="aurora.bands.value"
              :forecast="aurora.frame.value.forecast"
            />
            <MapFaults
              v-if="mv.faultsOn.value"
              :path="mv.view.value.path"
              :features="mv.visibleFaults.value"
              :hovered="mv.hoveredFault.value === null ? null : mv.hoveredFault.value.feature"
            />
            <MapPlates
              v-if="mv.showPlates.value"
              :path="mv.view.value.path"
              :features="mv.plates.value"
              @hover="mv.onPlateHover"
              @leave="mv.onPlateLeave()"
            />
            <MapTeeth
              v-if="mv.showTeeth.value"
              :frame="mv.view.value.frame"
              :segments="mv.plateSegments.value"
              :k="mv.transform.value.k"
              :highlight="mv.hoveredPlate.value"
            />
            <slot
              name="layers"
              :frame="mv.view.value.frame"
              :k="mv.transform.value.k"
              :min-radius="mv.minRadius.value"
            ></slot>
            <MapSection
              v-if="
                sectionTool &&
                (mv.section.shown.value !== null || mv.section.pending.value !== null)
              "
              :frame="mv.view.value.frame"
              :path="mv.view.value.path"
              :k="mv.transform.value.k"
              :section="mv.section.shown.value"
              :pending="mv.section.pending.value"
              :cursor="mv.section.cursor.value"
              @drag-start="mv.section.dragStart"
              @drag-move="mv.onSectionDragMove"
              @drag-end="mv.section.dragEnd()"
            />
            <MapMeasure
              v-if="mv.measure.shown.value !== null || mv.measure.pending.value !== null"
              :frame="mv.view.value.frame"
              :path="mv.view.value.path"
              :k="mv.transform.value.k"
              :line="mv.measure.shown.value"
              :pending="mv.measure.pending.value"
              :cursor="mv.measure.cursor.value"
              :lines="mv.measureText.value"
              @drag-start="mv.measure.dragStart"
              @drag-move="mv.onMeasureDragMove"
              @drag-end="mv.measure.dragEnd()"
            />
            <MapPin
              v-if="mv.pin.shown.value !== null"
              :frame="mv.view.value.frame"
              :k="mv.transform.value.k"
              :at="mv.pin.shown.value"
              :holding="mv.pin.holding.value"
              :lifted="mv.pin.lifted.value"
              @hover="mv.onPinHover"
              @leave="mv.onPinLeave()"
              @down="mv.onPinDown"
              @move="mv.onPinMove"
              @up="mv.onPinUp()"
            />
            <MapPin
              v-if="mv.pin.armed.value && mv.pin.cursor.value !== null"
              :frame="mv.view.value.frame"
              :k="mv.transform.value.k"
              :at="mv.pin.cursor.value"
              :holding="false"
              :lifted="false"
              ghost
            />
          </g>
        </svg>
      </div>
    </div>
    <MapTooltip :tip="mv.tip.value" />
    <div v-if="mv.touchHint.value !== null" class="touchhint" role="status">
      {{ mv.touchHint.value }}
    </div>
    <MapLegend
      v-if="!mv.theater.value"
      data-tour="map.legend"
      :frame="mv.view.value.frame"
      :min-mag="floor ?? mv.view.value.minMag"
      :faults="mv.hasFaults.value ? mv.faultAges.value : []"
      :quakes="quakes"
      :density="density"
      :field="mv.fieldRaster.value"
      :aurora="auroraLegend"
    >
      <slot name="legend"></slot>
    </MapLegend>
  </section>
</template>
