<script setup lang="ts">
import { computed } from "vue";
import {
  dateBoundsFor,
  EMPTY_FILTER,
  hasRange,
  isActive,
  parseBound,
  parseDate,
  type DateKey,
  type EventFilter,
  type NumberKey,
} from "../lib/filters.js";
import { CATALOG, CLOCK, SET_FILTER, STATUS, useInjected, ZONE } from "../lib/keys.js";

const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const status = useInjected(STATUS);
const zone = useInjected(ZONE);
const setFilter = useInjected(SET_FILTER);
const floor = computed(() => catalog.requireRegion().minMag);
const active = computed(() => isActive(catalog.filter.value));
const ranged = computed(() => hasRange(catalog.filter.value));
const bounds = computed(() =>
  dateBoundsFor(status.status.value?.events.oldest ?? null, clock.now.value, zone.value),
);
const zoneName = computed(() => (zone.value === "utc" ? "UTC" : "local time"));

const text = (k: NumberKey | DateKey): string => {
  const v = catalog.filter.value[k];
  return v === null ? "" : String(v);
};
function inputValue(ev: Event): string {
  const target = ev.target;
  return target instanceof HTMLInputElement ? target.value : "";
}
function changeNumber(k: NumberKey, ev: Event): void {
  const next: EventFilter = { ...catalog.filter.value, [k]: parseBound(inputValue(ev)) };
  setFilter(next);
}
function changeDate(k: DateKey, ev: Event): void {
  const next: EventFilter = { ...catalog.filter.value, [k]: parseDate(inputValue(ev)) };
  setFilter(next);
}
function clear(): void {
  setFilter(EMPTY_FILTER);
}
</script>

<template>
  <section class="filters" aria-label="Filters">
    <span class="flabel">Magnitude</span>
    <input
      type="number"
      step="0.1"
      :min="floor"
      :value="text('minMag')"
      placeholder="min"
      aria-label="Minimum magnitude"
      @change="changeNumber('minMag', $event)"
    />
    <span class="fto">to</span>
    <input
      type="number"
      step="0.1"
      :value="text('maxMag')"
      placeholder="max"
      aria-label="Maximum magnitude"
      @change="changeNumber('maxMag', $event)"
    />
    <span class="flabel">Depth km</span>
    <input
      type="number"
      step="1"
      :value="text('minDepth')"
      placeholder="min"
      aria-label="Minimum depth"
      @change="changeNumber('minDepth', $event)"
    />
    <span class="fto">to</span>
    <input
      type="number"
      step="1"
      :value="text('maxDepth')"
      placeholder="max"
      aria-label="Maximum depth"
      @change="changeNumber('maxDepth', $event)"
    />
    <span class="flabel">Dates ({{ zoneName }})</span>
    <input
      type="date"
      class="fdate"
      :min="bounds.min ?? undefined"
      :max="bounds.max"
      :value="text('since')"
      aria-label="From date"
      @change="changeDate('since', $event)"
    />
    <span class="fto">to</span>
    <input
      type="date"
      class="fdate"
      :min="bounds.min ?? undefined"
      :max="bounds.max"
      :value="text('until')"
      aria-label="To date"
      @change="changeDate('until', $event)"
    />
    <button type="button" class="fclear" :disabled="!active" @click="clear">Clear</button>
    <span class="fcount">
      <template v-if="active"
        >Showing {{ catalog.filtered.value.length }} of
        {{ catalog.windowEvents.value.length }} events<template v-if="ranged">
          in the selected dates</template
        >
        · summary tiles and major events are unfiltered</template
      >
      <template v-else>All {{ catalog.events.value.length }} events shown</template>
    </span>
  </section>
</template>
