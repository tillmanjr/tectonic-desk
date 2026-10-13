<script setup lang="ts">
import { computed } from "vue";
import {
  EMPTY_FILTER,
  isActive,
  parseBound,
  type EventFilter,
  type FilterKey,
} from "../lib/filters.js";
import { CATALOG, SET_FILTER, useInjected } from "../lib/keys.js";

const catalog = useInjected(CATALOG);
const setFilter = useInjected(SET_FILTER);
const floor = computed(() => catalog.requireRegion().minMag);
const active = computed(() => isActive(catalog.filter.value));

const text = (k: FilterKey): string => {
  const v = catalog.filter.value[k];
  return v === null ? "" : String(v);
};
function change(k: FilterKey, ev: Event): void {
  const target = ev.target;
  const raw = target instanceof HTMLInputElement ? target.value : "";
  const next: EventFilter = { ...catalog.filter.value, [k]: parseBound(raw) };
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
      @change="change('minMag', $event)"
    />
    <span class="fto">to</span>
    <input
      type="number"
      step="0.1"
      :value="text('maxMag')"
      placeholder="max"
      aria-label="Maximum magnitude"
      @change="change('maxMag', $event)"
    />
    <span class="flabel">Depth km</span>
    <input
      type="number"
      step="1"
      :value="text('minDepth')"
      placeholder="min"
      aria-label="Minimum depth"
      @change="change('minDepth', $event)"
    />
    <span class="fto">to</span>
    <input
      type="number"
      step="1"
      :value="text('maxDepth')"
      placeholder="max"
      aria-label="Maximum depth"
      @change="change('maxDepth', $event)"
    />
    <button type="button" class="fclear" :disabled="!active" @click="clear">Clear</button>
    <span class="fcount">
      <template v-if="active"
        >Showing {{ catalog.filtered.value.length }} of {{ catalog.events.value.length }} events ·
        summary tiles and major events are unfiltered</template
      >
      <template v-else>All {{ catalog.events.value.length }} events shown</template>
    </span>
  </section>
</template>
