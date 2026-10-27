<script setup lang="ts">
import type { SunKey } from "@tectonic/shared";
import { computed, ref } from "vue";
import SpaceAlerts from "./SpaceAlerts.vue";
import SpaceAurora from "./SpaceAurora.vue";
import SpaceFlares from "./SpaceFlares.vue";
import SpaceForecast from "./SpaceForecast.vue";
import SpaceRefine from "./SpaceRefine.vue";
import SpaceStack from "./SpaceStack.vue";
import SpaceTiles from "./SpaceTiles.vue";
import SunOverlay from "./SunOverlay.vue";
import SunStrip from "./SunStrip.vue";
import { SETTINGS, SPACE, useInjected } from "../lib/keys.js";
import { isLongRange } from "../lib/space.js";

/**
 * The Space page: window controls, six tiles, the Sun strip, the alert cards, the series stack
 * with its rail, and the aurora pair. Past 93 days the events give way to the long record and a
 * note says so. A Sun frame opens large in an overlay.
 */
const store = useInjected(SPACE);
const settings = useInjected(SETTINGS);
/** The flare the rail is pointing at, lit in the X-ray row. */
const highlight = ref<string | null>(null);
/** The Sun frame open in the overlay. */
const sunOpen = ref<SunKey | null>(null);
/** Whether the window on show is the long record, which carries no flares or alerts. */
const long = computed(() => {
  const w = store.window.value;
  return w !== null && isLongRange(new Date(w.from), new Date(w.to));
});
</script>

<template>
  <div v-if="store.error.value !== null" class="banner error" role="alert">
    <span>{{ store.error.value }}</span>
    <button type="button" @click="store.load()">Retry</button>
  </div>
  <SpaceRefine />
  <SpaceTiles />
  <SunStrip @open="sunOpen = $event" />
  <p v-if="long" class="note longnote">
    Flares, alerts and the minute-scale rows need a window of 93 days or less.
  </p>
  <SpaceAlerts v-else :rows="settings.current.value.cardRows.alone" />
  <section class="spacegrid">
    <SpaceStack :highlight="highlight" />
    <div class="spacerail">
      <SpaceForecast />
      <SpaceFlares v-if="!long" v-model:highlight="highlight" />
    </div>
  </section>
  <SpaceAurora />
  <SunOverlay v-model:open="sunOpen" />
</template>
