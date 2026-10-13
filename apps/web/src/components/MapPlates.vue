<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import type { Feature, LineString } from "geojson";
import { pathOf, PLATE_CLASSES, type PlateProps } from "../lib/geo.js";

defineProps<{ path: GeoPath; features: Feature<LineString, PlateProps>[] }>();
const emit = defineEmits<{
  hover: [payload: { title: string; x: number; y: number }];
  leave: [];
}>();

function hover(ev: MouseEvent, f: Feature<LineString, PlateProps>): void {
  emit("hover", { title: f.properties.title, x: ev.clientX, y: ev.clientY });
}
</script>

<template>
  <g>
    <g v-for="(f, i) in features" :key="i">
      <path
        class="hit"
        :d="pathOf(path, f)"
        fill="none"
        stroke="transparent"
        stroke-width="10"
        vector-effect="non-scaling-stroke"
        style="pointer-events: stroke"
        @mousemove="hover($event, f)"
        @mouseleave="emit('leave')"
      />
      <path
        class="line"
        :d="pathOf(path, f)"
        fill="none"
        style="stroke: var(--plate); pointer-events: none"
        :stroke-width="PLATE_CLASSES[f.properties.cls].width"
        :stroke-dasharray="PLATE_CLASSES[f.properties.cls].dash ?? undefined"
        stroke-opacity="0.85"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
