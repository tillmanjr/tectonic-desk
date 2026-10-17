<script setup lang="ts">
import type { ApiEventGrid } from "@tectonic/shared";
import type { GeoPermissibleObjects } from "d3-geo";
import { computed } from "vue";
import { cellRing, densityOpacity } from "../lib/density.js";

/** Grid cells shaded by count under the markers. Not interactive: pointer events pass through. */
const props = defineProps<{
  path: (object: GeoPermissibleObjects) => string | null;
  grid: ApiEventGrid;
}>();

const cells = computed(() => {
  const { cell, cells: list } = props.grid;
  const opacity = densityOpacity(Math.max(1, ...list.map((c) => c.count)));
  return list.flatMap((c) => {
    const d = props.path(cellRing(c.lat, c.lon, cell));
    return d === null
      ? []
      : [{ key: `${String(c.lat)},${String(c.lon)}`, d, opacity: opacity(c.count) }];
  });
});
</script>

<template>
  <g class="density" style="pointer-events: none">
    <path
      v-for="c in cells"
      :key="c.key"
      :d="c.d"
      :fill-opacity="c.opacity"
      style="fill: var(--accent)"
    />
  </g>
</template>
