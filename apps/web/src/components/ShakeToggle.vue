<script setup lang="ts">
import { computed } from "vue";
import { vHint } from "../lib/hint.js";
import type { ShakeLayer } from "../lib/layers.js";

/** The map toolbar's ShakeMap toggle and its state: usable only for a selected event with one. */
const props = defineProps<{ shake: ShakeLayer }>();
const { shake } = props;
const NOTES = {
  off: null,
  none: "select an event with one",
  loading: "loading",
  ready: null,
  missing: "none for this event",
  error: "unavailable",
} as const;
const HINT =
  "Shades the selected earthquake's USGS ShakeMap: Modified Mercalli Intensity estimated from ground-motion models with site amplification (Vs30), constrained by station recordings and felt reports. Point at the bands for the intensity there. USGS publishes one for most M5.5+ events worldwide and for smaller events in well-instrumented networks.";
const note = computed(() => NOTES[shake.state.value]);
</script>

<template>
  <label v-hint="HINT" class="shaketoggle" :class="{ unavailable: !shake.available.value }"
    ><input v-model="shake.show.value" type="checkbox" /> ShakeMap<span
      v-if="note !== null"
      class="shakenote"
      >{{ note }}</span
    ></label
  >
</template>
