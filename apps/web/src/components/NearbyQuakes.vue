<script setup lang="ts">
import type { ApiEvent, Volcano } from "@tectonic/shared";
import { computed } from "vue";
import { ago, fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected } from "../lib/keys.js";
import { distanceKm } from "../lib/volcanoes.js";

/** Earthquakes of the loaded window within reach of a volcano, largest first. */
const NEARBY_KM = 50;
const TOP = 3;

const props = defineProps<{ volcano: Volcano }>();
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);

const magOf = (e: ApiEvent): number => e.mag ?? -1;

const near = computed(() => {
  const { lat, lon } = props.volcano;
  const close = catalog.filtered.value.filter(
    (e) => distanceKm(lat, lon, e.latitude, e.longitude) <= NEARBY_KM,
  );
  const top = [...close].sort((a, b) => magOf(b) - magOf(a)).slice(0, TOP);
  return { count: close.length, top };
});
</script>

<template>
  <h3>Earthquakes within {{ NEARBY_KM }} km</h3>
  <p v-if="near.count === 0" class="note">None in the loaded window and filter.</p>
  <template v-else>
    <p class="cap">{{ near.count }} in the loaded window; the largest:</p>
    <ul class="erlist">
      <li v-for="e in near.top" :key="e.id">
        <button type="button" class="linkbtn" @click="select(e.id)">
          M{{ fmtMag(e.mag) }} · {{ placeOf(e) }} · {{ ago(e.time, clock.now.value) }} ago
        </button>
      </li>
    </ul>
  </template>
</template>
