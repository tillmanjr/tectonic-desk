<script setup lang="ts">
import { computed } from "vue";
import RefineBar from "./RefineBar.vue";
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
import { fmtFloor, fmtInt } from "../lib/format.js";
import { vHint } from "../lib/hint.js";
import { CATALOG, CLOCK, SET_FILTER, useInjected, ZONE } from "../lib/keys.js";
import { quakeParts } from "../lib/refine.js";

/** Hints for the inputs, shown after a pause. */
const HINTS = {
  magnitude:
    "Magnitude range for the map, catalog and charts, in whatever magnitude type the authoritative network reports (Mw, ML, mb, Md …). The minimum cannot go below the region's catalogue floor.",
  depth:
    "Hypocentral depth range in km below sea level, as reported. Leave a side empty for no bound; shallow events can carry small negative depths.",
  span: "How long the window is. Picking a length moves the from date; changing the to date keeps the length.",
  from: "First day of the window, inclusive. Changing it makes the window custom.",
  to: "Last day of the window, inclusive. The from date moves with it while a preset length is in force.",
  reset: "Clear every refinement: back to the region's magnitude floor and the default window.",
};
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const setFilter = useInjected(SET_FILTER);
const floor = computed(() => catalog.requireRegion().minMag);
const active = computed(() => isActive(catalog.filter.value));
const bounds = computed(() => dateBoundsFor(clock.now.value, zone.value));
/** The days in force, so the inputs always show the window being queried. */
const span = computed(() => resolveDates(catalog.filter.value, clock.now.value, zone.value));
/** The span preset the days in force match, or -1 for a custom range. */
const presetIndex = computed(() =>
  SPANS.findIndex((s) => spanStart(span.value.until, s.days) === span.value.since),
);
const preset = computed(() => SPANS[presetIndex.value]);
/** The collapsed bar's clauses. */
const parts = computed(() =>
  quakeParts(
    catalog.filter.value,
    span.value,
    catalog.requested.value,
    preset.value?.label ?? null,
  ),
);
const zoneName = computed(() => (zone.value === "utc" ? "UTC" : "local"));
/** Why the page shows fewer events than the window holds. */
const note = computed(() => {
  const s = catalog.stats.value;
  if (s === null || !catalog.raised.value) return null;
  return `This window holds ${fmtInt(s.total)} events at ${fmtFloor(catalog.requested.value)}. Markers, table and the magnitude charts show the ${fmtInt(catalog.windowEvents.value.length)} at ${fmtFloor(catalog.floor.value)} so the page stays responsive; the time chart covers all of them, and the map's Density toggle shades where they fall.`;
});

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
/** A new end date keeps the span in force by moving the start with it; a new start makes the range custom. */
function changeDate(k: DateKey, ev: Event): void {
  const next: EventFilter = { ...catalog.filter.value, [k]: parseDate(inputValue(ev)) };
  const keep = k === "until" ? preset.value : undefined;
  if (keep !== undefined) {
    next.since = spanStart(resolveDates(next, clock.now.value, zone.value).until, keep.days);
  }
  setFilter(next);
}
function pickSpan(ev: Event): void {
  const target = ev.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const pick = SPANS[Number(target.value)];
  if (pick === undefined) return;
  setFilter({ ...catalog.filter.value, since: spanStart(span.value.until, pick.days) });
}
function clear(): void {
  setFilter(EMPTY_FILTER);
}
</script>

<template>
  <RefineBar
    dataset="earthquakes"
    :parts="parts"
    :hidden="catalog.hideMarkers.value"
    :busy="catalog.loading.value"
    :error="catalog.error.value"
    @update:hidden="catalog.hideMarkers.value = $event"
  >
    <template #info>
      <span
        v-hint="
          'These settings refine the map, catalog and charts. The summary tiles and major events are unaffected.'
        "
        class="finfo"
        role="img"
        aria-label="These settings refine the map, catalog and charts; the summary tiles and major events are unaffected"
        >i</span
      >
    </template>
    <span v-hint="HINTS.magnitude" class="flabel">Magnitude</span>
    <input
      v-hint="HINTS.magnitude"
      type="number"
      step="0.1"
      :min="floor"
      :value="String(catalog.requested.value)"
      placeholder="min"
      aria-label="Minimum magnitude"
      @change="changeNumber('minMag', $event)"
    />
    <span class="fto">to</span>
    <input
      v-hint="HINTS.magnitude"
      type="number"
      step="0.1"
      :value="text('maxMag')"
      placeholder="max"
      aria-label="Maximum magnitude"
      @change="changeNumber('maxMag', $event)"
    />
    <span v-hint="HINTS.depth" class="flabel">Depth km</span>
    <input
      v-hint="HINTS.depth"
      type="number"
      step="1"
      :value="text('minDepth')"
      placeholder="min"
      aria-label="Minimum depth"
      @change="changeNumber('minDepth', $event)"
    />
    <span class="fto">to</span>
    <input
      v-hint="HINTS.depth"
      type="number"
      step="1"
      :value="text('maxDepth')"
      placeholder="max"
      aria-label="Maximum depth"
      @change="changeNumber('maxDepth', $event)"
    />
    <span
      v-hint="
        `The time window, in ${zoneName} calendar days (the Settings menu switches between UTC and local).`
      "
      class="flabel fdates"
      >Window ({{ zoneName }})</span
    >
    <select
      v-hint="HINTS.span"
      class="fspan"
      :value="presetIndex < 0 ? '' : String(presetIndex)"
      aria-label="Window length"
      @change="pickSpan"
    >
      <option value="" disabled>Custom</option>
      <option v-for="(s, i) in SPANS" :key="s.label" :value="String(i)">{{ s.label }}</option>
    </select>
    <span class="fto">from</span>
    <input
      v-hint="HINTS.from"
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
      v-hint="HINTS.to"
      type="date"
      class="fdate"
      :min="bounds.min"
      :max="bounds.max"
      :value="span.until"
      aria-label="To date"
      @change="changeDate('until', $event)"
    />
    <button v-hint="HINTS.reset" type="button" class="fclear" :disabled="!active" @click="clear">
      Reset
    </button>
    <template #note>
      <p v-if="note !== null" class="fnote">{{ note }}</p>
    </template>
  </RefineBar>
</template>
