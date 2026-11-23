<script setup lang="ts">
import { MMI_SCALE, type ApiShakeMap } from "@tectonic/shared";
import { shakeCaption } from "../lib/shakemap.js";

/** The legend row for a ShakeMap on the map: the MMI levels in USGS's colours and the product's caption. */
defineProps<{ map: ApiShakeMap }>();
const LEVELS = MMI_SCALE.filter((l) => l.mmi >= 2);
</script>

<template>
  <span class="sw shakerow">
    <span v-for="l in LEVELS" :key="l.mmi" class="sw">
      <i class="shakekey" :style="{ background: l.color }"></i>{{ l.roman }}
    </span>
    <span>MMI · {{ shakeCaption(map) }}</span>
  </span>
</template>
