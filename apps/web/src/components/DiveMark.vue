<script setup lang="ts">
import { computed, inject } from "vue";
import DiveMarkMenu from "./DiveMarkMenu.vue";
import { SETTINGS } from "../lib/keys.js";
import { MANUAL } from "../lib/manual.js";
import { TOUR, type TourId } from "../lib/tour.js";

/**
 * A part of the desk's ◆ deep dive mark, where it is wanted: inside the app (a tour runner and the
 * Field manual provided), for an area that has deep dives, and while the reader has the marks on.
 */
const props = defineProps<{ area: string; dive?: TourId }>();
const tour = inject(TOUR, null);
const manual = inject(MANUAL, null);
const settings = inject(SETTINGS, null);
const shown = computed(
  () =>
    tour !== null &&
    manual !== null &&
    settings?.current.value.diveMarks !== false &&
    tour.tours.some((t) => t.deep?.area === props.area),
);
</script>

<template>
  <DiveMarkMenu v-if="shown" :area="area" :dive="dive" />
</template>
