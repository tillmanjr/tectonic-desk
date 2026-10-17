<script setup lang="ts">
import { computed } from "vue";
import {
  dateBoundsFor,
  EMPTY_FILTER,
  isActive,
  parseBound,
  parseDate,
  resolveDates,
  SPANS,
  spanStart,
  type DateKey,
  type EventFilter,
  type NumberKey,
} from "../lib/filters.js";
import { CATALOG, CLOCK, SET_FILTER, useInjected, ZONE } from "../lib/keys.js";

const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const setFilter = useInjected(SET_FILTER);
const floor = computed(() => catalog.requireRegion().minMag);
const active = computed(() => isActive(catalog.filter.value));
const bounds = computed(() => dateBoundsFor(clock.now.value, zone.value));
/** The days in force, so the inputs always show the window being queried. */
const span = computed(() => resolveDates(catalog.filter.value, clock.now.value, zone.value));
const zoneName = computed(() => (zone.value === "utc" ? "UTC" : "local"));

const text = (k: NumberKey): string => {
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
function pickSpan(ev: Event): void {
  const target = ev.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const pick = SPANS[Number(target.value)];
  target.value = "";
  if (pick === undefined) return;
  setFilter({ ...catalog.filter.value, since: spanStart(span.value.until, pick.days) });
}
function clear(): void {
  setFilter(EMPTY_FILTER);
}
</script>

<template>
  <section class="filters" aria-label="Refine">
    <span class="ftitle">Refine</span>
    <span
      class="finfo"
      role="img"
      aria-label="These settings refine the map, catalog and charts; the summary tiles and major events are unaffected"
      title="These settings refine the map, catalog and charts. The summary tiles and major events are unaffected."
      >i</span
    >
    <span class="flabel">Magnitude</span>
    <input
      type="number"
      step="0.1"
      :min="floor"
      :value="String(catalog.floor.value)"
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
    <span class="flabel fdates">Dates ({{ zoneName }})</span>
    <input
      type="date"
      class="fdate"
      :min="bounds.min"
      :max="bounds.max"
      :value="span.since"
      aria-label="From date"
      @change="changeDate('since', $event)"
    />
    <span class="fto">to</span>
    <input
      type="date"
      class="fdate"
      :min="bounds.min"
      :max="bounds.max"
      :value="span.until"
      aria-label="To date"
      @change="changeDate('until', $event)"
    />
    <select class="fspan" value="" aria-label="Set the window span" @change="pickSpan">
      <option value="" disabled selected>Span…</option>
      <option v-for="(s, i) in SPANS" :key="s.label" :value="String(i)">{{ s.label }}</option>
    </select>
    <button type="button" class="fclear" :disabled="!active" @click="clear">Reset</button>
  </section>
</template>
