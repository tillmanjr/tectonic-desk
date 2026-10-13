<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import type { Feature, LineString } from "geojson";
import { ref } from "vue";
import { pathOf, PLATE_CLASSES, type PlateProps } from "../lib/geo.js";

defineProps<{ path: GeoPath; features: Feature<LineString, PlateProps>[] }>();
const emit = defineEmits<{
  hover: [payload: { index: number; title: string; x: number; y: number }];
  leave: [];
}>();
const hovered = ref<number | null>(null);

function hover(ev: MouseEvent, f: Feature<LineString, PlateProps>, index: number): void {
  hovered.value = index;
  emit("hover", { index, title: f.properties.title, x: ev.clientX, y: ev.clientY });
}
function leave(): void {
  hovered.value = null;
  emit("leave");
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
        @mousemove="hover($event, f, i)"
        @mouseleave="leave"
      />
      <path
        class="line"
        :class="{ hot: i === hovered }"
        :d="pathOf(path, f)"
        fill="none"
        :style="{ stroke: i === hovered ? 'var(--accent)' : 'var(--plate)', pointerEvents: 'none' }"
        :stroke-width="PLATE_CLASSES[f.properties.cls].width + (i === hovered ? 1.2 : 0)"
        :stroke-dasharray="PLATE_CLASSES[f.properties.cls].dash ?? undefined"
        :stroke-opacity="i === hovered ? 1 : 0.85"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
