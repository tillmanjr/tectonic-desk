<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import type { Feature, LineString } from "geojson";
import { pathOf, PLATE_CLASSES, type PlateProps } from "../lib/geo.js";

defineProps<{ path: GeoPath; features: Feature<LineString, PlateProps>[] }>();
</script>

<template>
  <g>
    <g v-for="(f, i) in features" :key="i">
      <path
        class="hit"
        :d="pathOf(path, f)"
        fill="none"
        stroke="transparent"
        stroke-width="14"
        vector-effect="non-scaling-stroke"
        style="pointer-events: stroke"
      >
        <title>{{ f.properties.title }}</title>
      </path>
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
