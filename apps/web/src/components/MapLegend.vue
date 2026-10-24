<script setup lang="ts">
import type { FieldRaster } from "@tectonic/shared";
import { computed } from "vue";
import { DENSITY_RAMP, type DensityLegend } from "../lib/density.js";
import { FAULT_AGES, type AgeCode } from "../lib/faults.js";
import { fmtFloor, fmtInt } from "../lib/format.js";
import { PLATE_CLASSES, type MapFrame } from "../lib/geo.js";
import { markerRadius } from "../lib/markers.js";

const props = withDefaults(
  defineProps<{
    frame: MapFrame;
    minMag: number;
    faults?: readonly AgeCode[];
    /** Whether the earthquake rows (depth colours, magnitude sizes, beachball note) are shown. */
    quakes?: boolean;
    /** The density shading in force, for its ramp row; null when the map draws none. */
    density?: DensityLegend | null;
    /** The gravity or magnetic raster under the map, for its ramp row; null when none is drawn. */
    field?: FieldRaster | null;
  }>(),
  { faults: () => [], quakes: true, density: null, field: null },
);
/** A gradient id unique to the raster, so two legends on one page do not share one. */
const gradId = (f: FieldRaster): string => `fieldgrad-${f.field}-${f.view}`;
/** A stop's place along the ramp as a percentage of the value span. */
function offsetOf(f: FieldRaster, v: number): string {
  const values = f.stops.map(([x]) => x);
  const first = Math.min(...values);
  const span = Math.max(...values) - first;
  return `${String(span === 0 ? 0 : Math.round(((v - first) / span) * 1000) / 10)}%`;
}
const sizes = computed(() => {
  const min = props.minMag;
  const mags = props.frame.global && min <= 4.5 ? [4.5, 5.5, 6.5, 7.5] : [min, min + 1, min + 2];
  return mags.map((m) => ({ m, r: markerRadius(m, props.minMag, props.frame.global) }));
});
const plates = Object.values(PLATE_CLASSES);
</script>

<template>
  <div class="legend">
    <template v-if="quakes">
      <span class="sw"><i style="background: var(--shallow)"></i>0–70 km</span>
      <span class="sw"><i style="background: var(--inter)"></i>70–300 km</span>
      <span class="sw"><i style="background: var(--deep)"></i>≥300 km</span>
      <span class="sw"><i style="background: var(--muted)"></i>depth not reported</span>
      <span v-for="s in sizes" :key="s.m" class="sw">
        <svg :width="2 * s.r + 2" :height="2 * s.r + 2">
          <circle :cx="s.r + 1" :cy="s.r + 1" :r="s.r" fill="none" style="stroke: var(--muted)" />
        </svg>
        M{{ s.m }}
      </span>
      <span class="sw">Beachball: shaded = compressional (P-wave first motion up)</span>
      <span v-if="density !== null" class="sw">
        <svg width="52" height="10" aria-hidden="true">
          <rect
            v-for="(o, i) in DENSITY_RAMP"
            :key="i"
            :x="i * 10"
            y="0"
            width="10"
            height="10"
            :fill-opacity="o"
            style="fill: var(--accent)"
          />
        </svg>
        events per {{ density.cell }}° cell at {{ fmtFloor(density.floor) }}: 1 →
        {{ fmtInt(density.max) }} (log scale)
      </span>
    </template>
    <span v-if="field !== null" class="sw fieldrow">
      <svg width="160" height="10" aria-hidden="true">
        <defs>
          <linearGradient :id="gradId(field)" x1="0" x2="1" y1="0" y2="0">
            <stop
              v-for="(s, i) in field.stops"
              :key="i"
              :offset="offsetOf(field, s[0])"
              :stop-color="s[1]"
            />
          </linearGradient>
        </defs>
        <rect width="160" height="10" :fill="`url(#${gradId(field)})`" />
      </svg>
      <span class="ticks"
        ><span v-for="t in field.ticks" :key="t">{{ t }}</span></span
      >
      <span class="fieldcap"
        >{{ field.units }} · {{ field.caption
        }}<template v-if="field.equalised"> · equalised ramp</template></span
      >
    </span>
    <span v-for="p in plates" :key="p.name" class="sw">
      <svg width="26" height="10">
        <line
          x1="1"
          y1="7"
          x2="25"
          y2="7"
          style="stroke: var(--plate)"
          :stroke-width="p.width + 0.4"
          :stroke-dasharray="p.dash ?? undefined"
        />
        <path
          v-if="p.teeth"
          class="teeth"
          d="M6,7L9,1.5L12,7ZM16,7L19,1.5L22,7Z"
          style="fill: var(--plate)"
        />
      </svg>
      {{ p.name }}
    </span>
    <span class="sw hint-sw"
      >Point at a boundary line for the plate pair, relative velocity and, on subduction zones,
      which plate goes under.</span
    >
    <span class="sw hint-sw touch-only"
      >Tap a marker for its details. A locked map moves with two fingers; the lock icon in the
      corner frees one-finger panning and pinch zoom.</span
    >
    <template v-if="faults.length > 0">
      <span v-for="code in faults" :key="code" class="sw">
        <svg width="26" height="10">
          <line
            x1="1"
            y1="5"
            x2="25"
            y2="5"
            :style="{ stroke: FAULT_AGES[code].color }"
            stroke-width="2"
          />
        </svg>
        {{ FAULT_AGES[code].label }}
      </span>
      <span class="sw hint-sw"
        >Quaternary faults (USGS): solid = well constrained, dashed = moderately constrained, dotted
        = inferred. Point at a trace for the fault, age, slip rate, sense and dip.</span
      >
    </template>
    <slot></slot>
  </div>
</template>
