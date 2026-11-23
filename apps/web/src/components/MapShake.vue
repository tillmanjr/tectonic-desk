<script setup lang="ts">
import type { ApiShakeMap } from "@tectonic/shared";
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { pathOf } from "../lib/geo.js";
import { shakeBands, shakeExtent } from "../lib/shakemap.js";

/**
 * The selected event's ShakeMap under the markers: MMI bands in USGS's colours, lowest first,
 * each opaque inside a group that carries the translucency, so a point shows its own level's
 * colour rather than a blend of every band below it; and the map's extent dashed, since its
 * edge is where USGS stopped computing, not an intensity boundary. No pointer events; the map
 * reads the intensity under the pointer itself.
 */
const props = defineProps<{ path: GeoPath; map: ApiShakeMap }>();
const bands = computed(() => shakeBands(props.map.grid));
const paths = computed(() =>
  bands.value.map((b) => ({ mmi: b.mmi, color: b.color, d: pathOf(props.path, b.shape) })),
);
const extent = computed(() => pathOf(props.path, shakeExtent(props.map.grid)));
</script>

<template>
  <g class="shake" data-layer="shakemap">
    <g class="sbands">
      <path v-for="b in paths" :key="b.mmi" class="sband" :d="b.d" :style="{ fill: b.color }" />
    </g>
    <path class="sextent" :d="extent" />
  </g>
</template>
