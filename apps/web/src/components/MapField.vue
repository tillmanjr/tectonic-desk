<script setup lang="ts">
import type { FieldRaster } from "@tectonic/shared";
import type { MapFrame } from "../lib/geo.js";

/** A gravity or magnetic raster stretched over the frame, rendered in its projection ahead of time. */
defineProps<{ raster: FieldRaster; frame: MapFrame }>();
</script>

<template>
  <image
    class="field"
    :href="raster.src"
    x="0"
    y="0"
    :width="frame.width"
    :height="frame.height"
    preserveAspectRatio="none"
  />
</template>
