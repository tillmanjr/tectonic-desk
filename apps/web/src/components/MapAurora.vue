<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { nightRing } from "../lib/aurora-map.js";
import type { AuroraBand } from "../lib/aurora-bands.js";
import { pathOf } from "../lib/geo.js";
import { subsolarPoint } from "../lib/sun.js";

/**
 * The aurora store's frame on a world map: the night side at the forecast time under the
 * probability bands, drawn through the frame's path like the plates. Not interactive.
 */
const props = defineProps<{
  path: GeoPath;
  /** One band per threshold, weakest first. */
  bands: AuroraBand[];
  /** The instant the bands are for; it sets the Sun's position. */
  forecast: string;
}>();

const night = computed(() =>
  pathOf(props.path, nightRing(subsolarPoint(new Date(props.forecast)))),
);
const bandPaths = computed(() =>
  props.bands.map((b) => ({ level: b.level, d: pathOf(props.path, b.shape) })),
);
</script>

<template>
  <g class="aurora" style="pointer-events: none">
    <path class="night" :d="night" />
    <path
      v-for="b in bandPaths"
      :key="b.level"
      class="band"
      :class="`au-${String(b.level)}`"
      :d="b.d"
    />
  </g>
</template>
