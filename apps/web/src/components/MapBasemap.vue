<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { graticuleFor, pathOf, type Basemap, type MapFrame } from "../lib/geo.js";

const props = defineProps<{ frame: MapFrame; path: GeoPath; basemap: Basemap | null }>();
const graticule = computed(() => pathOf(props.path, graticuleFor(props.frame)));
const sphere = computed(() => pathOf(props.path, { type: "Sphere" }));
</script>

<template>
  <g>
    <path v-if="frame.global" :d="sphere" style="fill: var(--ocean)" />
    <rect v-else :width="frame.width" :height="frame.height" style="fill: var(--ocean)" />
    <path
      :d="graticule"
      fill="none"
      style="stroke: var(--line)"
      stroke-width="0.5"
      vector-effect="non-scaling-stroke"
    />
    <template v-if="basemap !== null">
      <path
        :d="pathOf(path, basemap.land)"
        style="fill: var(--land); stroke: var(--border)"
        :stroke-width="frame.global ? 0.5 : 0.7"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="pathOf(path, basemap.borders)"
        fill="none"
        style="stroke: var(--border)"
        :stroke-width="frame.global ? 0.35 : 0.6"
        :stroke-dasharray="frame.global ? undefined : '3 2'"
        vector-effect="non-scaling-stroke"
      />
    </template>
  </g>
</template>
