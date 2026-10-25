<script setup lang="ts">
import MapBasemap from "./MapBasemap.vue";
import MapFaults from "./MapFaults.vue";
import MapField from "./MapField.vue";
import MapLegend from "./MapLegend.vue";
import MapPlates from "./MapPlates.vue";
import MapSection from "./MapSection.vue";
import MapTeeth from "./MapTeeth.vue";
import MapTooltip from "./MapTooltip.vue";
import type { DensityLegend } from "../lib/density.js";
import { AGE_CODES, FAULT_AGES } from "../lib/faults.js";
import { FIELD_CHOICES } from "../lib/fields.js";
import type { MapView } from "../lib/mapview.js";

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
  }>(),
  { quakes: true, density: null, floor: null, sectionTool: true },
);
const { mv } = props;
</script>

<template>
  <section :ref="mv.cardEl" class="mapcard">
    <div class="maptools">
      <slot name="tools"></slot>
      <label><input v-model="mv.showPlates.value" type="checkbox" /> Plate boundaries</label>
      <label><input v-model="mv.showTeeth.value" type="checkbox" /> Subduction teeth</label>
      <div v-if="mv.hasFaults.value" class="layerpick">
        <label
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
          type="button"
          class="pickopen"
          aria-label="Choose which Quaternary faults to show"
          title="Choose which Quaternary faults to show, by age of last movement"
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
      <label class="fieldpick"
        >Field
        <select v-model="mv.field.value" aria-label="Field overlay">
          <option v-for="c in FIELD_CHOICES" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <span v-if="mv.fieldError.value" class="fielderr">unavailable</span>
      </label>
      <button
        v-if="sectionTool"
        type="button"
        class="sectionbtn"
        :aria-pressed="mv.section.armed.value"
        title="Draw a section line: click two points on the map; drag the ends to adjust"
        @click="mv.section.toggle()"
      >
        Section
      </button>
      <span class="sp"></span>
      <button type="button" class="zbtn" aria-label="Zoom in" @click="mv.scaleBy(1.8)">+</button>
      <button type="button" class="zbtn" aria-label="Zoom out" @click="mv.scaleBy(1 / 1.8)">
        −
      </button>
      <button
        type="button"
        class="zbtn"
        aria-label="Reset view"
        style="width: auto; padding: 0 8px"
        @click="mv.reset()"
      >
        Reset
      </button>
      <slot name="actions"></slot>
    </div>
    <slot name="bar"></slot>
    <div class="mapwrap">
      <span class="mapcount" aria-live="polite">{{ countLine }}</span>
      <button
        type="button"
        class="maplock"
        :aria-pressed="mv.locked.value"
        aria-label="Lock map"
        :title="
          mv.locked.value
            ? 'Map locked: wheel and drag scroll the page. Click to pan and zoom by hand.'
            : 'Map unlocked: wheel and drag move the map. Click to lock it.'
        "
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
            <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--muted)" stroke-width="2.2" />
            <line x1="5.8" y1="5.8" x2="26.2" y2="26.2" stroke="var(--muted)" stroke-width="2.2" />
          </g>
        </svg>
      </button>
      <svg
        :ref="mv.svgEl"
        class="map"
        role="img"
        :aria-label="label"
        :viewBox="`0 0 ${String(mv.view.value.frame.width)} ${String(mv.view.value.frame.height)}`"
        :class="{ locked: mv.locked.value, arming: mv.section.armed.value }"
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
              sectionTool && (mv.section.shown.value !== null || mv.section.pending.value !== null)
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
        </g>
      </svg>
    </div>
    <MapTooltip :tip="mv.tip.value" />
    <div v-if="mv.touchHint.value !== null" class="touchhint" role="status">
      {{ mv.touchHint.value }}
    </div>
    <MapLegend
      :frame="mv.view.value.frame"
      :min-mag="floor ?? mv.view.value.minMag"
      :faults="mv.hasFaults.value ? mv.faultAges.value : []"
      :quakes="quakes"
      :density="density"
      :field="mv.fieldRaster.value"
    >
      <slot name="legend"></slot>
    </MapLegend>
  </section>
</template>
