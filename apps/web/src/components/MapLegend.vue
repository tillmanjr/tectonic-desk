<script setup lang="ts">
import { computed } from "vue";
import { FAULT_AGES } from "../lib/faults.js";
import { PLATE_CLASSES, type MapFrame } from "../lib/geo.js";
import { markerRadius } from "../lib/markers.js";

const props = withDefaults(defineProps<{ frame: MapFrame; minMag: number; faults?: boolean }>(), {
  faults: false,
});
const sizes = computed(() => {
  const mags = props.frame.global
    ? [4.5, 5.5, 6.5, 7.5]
    : [props.minMag, props.minMag + 1, props.minMag + 2];
  return mags.map((m) => ({ m, r: markerRadius(m, props.minMag, props.frame.global) }));
});
const plates = Object.values(PLATE_CLASSES);
</script>

<template>
  <div class="legend">
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
    <template v-if="faults">
      <span v-for="(a, code) in FAULT_AGES" :key="code" class="sw">
        <svg width="26" height="10">
          <line x1="1" y1="5" x2="25" y2="5" :style="{ stroke: a.color }" stroke-width="2" />
        </svg>
        {{ a.label }}
      </span>
      <span class="sw hint-sw"
        >Quaternary faults (USGS): solid = well constrained, dashed = moderately constrained, dotted
        = inferred. Point at a trace for the fault, age, slip rate, sense and dip.</span
      >
    </template>
  </div>
</template>
