<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import type { Feature, LineString } from "geojson";
import { pathOf, PLATE_CLASSES, type PlateProps } from "../lib/geo.js";

defineProps<{ path: GeoPath; features: Feature<LineString, PlateProps>[] }>();
</script>

<template>
  <g>
    <path
      v-for="(f, i) in features"
      :key="i"
      :d="pathOf(path, f)"
      fill="none"
      style="stroke: var(--plate)"
      :stroke-width="PLATE_CLASSES[f.properties.cls].width"
      :stroke-dasharray="PLATE_CLASSES[f.properties.cls].dash ?? undefined"
      stroke-opacity="0.85"
      vector-effect="non-scaling-stroke"
    >
      <title>{{ f.properties.title }}</title>
    </path>
  </g>
</template>
