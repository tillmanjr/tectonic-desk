<script setup lang="ts">
import type { ApiEvent } from "@tectonic/shared";
import { computed, ref, watch } from "vue";
import RangeInputs from "./RangeInputs.vue";
import TableFilterHead from "./TableFilterHead.vue";
import { depthColor } from "../lib/depth.js";
import { dateBoundsFor, parseDate } from "../lib/filters.js";
import { fmtInt, fmtMag, fmtStamp, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { preferredMechanism } from "../lib/stats.js";
import {
  activeEventColumns,
  applyEventTableFilter,
  EMPTY_EVENT_TABLE_FILTER,
  type EventTableFilter,
} from "../lib/table-filters.js";

type SortKey = "time" | "mag" | "depthKm" | "place";
const COLS: { key: SortKey; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "mag", label: "M" },
  { key: "depthKm", label: "Depth" },
  { key: "place", label: "Location" },
];

const catalog = useInjected(CATALOG);
const { filtered: events, selectedId, windowTotal } = catalog;
const select = useInjected(SELECT);
const zone = useInjected(ZONE);
const clock = useInjected(CLOCK);
const sortKey = ref<SortKey>("time");
const sortDir = ref<1 | -1>(-1);

/** The table's own column filter: narrows the rows only, resets with the region. */
const filter = ref<EventTableFilter>(EMPTY_EVENT_TABLE_FILTER);
const open = ref(false);
const activeCols = computed<Set<string>>(() => activeEventColumns(filter.value));
const narrowed = computed(() => applyEventTableFilter(events.value, filter.value, zone.value));
const bounds = computed(() => dateBoundsFor(clock.now.value, zone.value));
const sinceEl = ref<HTMLInputElement | null>(null);
const untilEl = ref<HTMLInputElement | null>(null);

function setDates(): void {
  filter.value = {
    ...filter.value,
    since: parseDate(sinceEl.value?.value),
    until: parseDate(untilEl.value?.value),
  };
}
function setMag(r: { min: number | null; max: number | null }): void {
  filter.value = { ...filter.value, minMag: r.min, maxMag: r.max };
}
function setDepth(r: { min: number | null; max: number | null }): void {
  filter.value = { ...filter.value, minDepth: r.min, maxDepth: r.max };
}
function clear(): void {
  filter.value = EMPTY_EVENT_TABLE_FILTER;
}
watch(
  () => catalog.region.value?.id,
  () => {
    clear();
    open.value = false;
  },
);

function sortBy(k: SortKey): void {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = k;
    sortDir.value = k === "place" ? 1 : -1;
  }
}
function value(e: ApiEvent): string | number {
  const v = e[sortKey.value];
  if (v !== null) return v;
  return sortKey.value === "place" ? "" : -Infinity;
}
const rows = computed(() =>
  [...narrowed.value].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir.value;
  }),
);
const tag = (e: ApiEvent): string | null => preferredMechanism(e)?.kind.toUpperCase() ?? null;
const ariaSort = (k: SortKey): "ascending" | "descending" | undefined =>
  k === sortKey.value ? (sortDir.value === 1 ? "ascending" : "descending") : undefined;
</script>

<template>
  <div class="panel tablepanel">
    <h2 class="withfilter">
      Catalog
      <span v-if="activeCols.size > 0"
        >{{ narrowed.length }} of {{ fmtInt(windowTotal) }} events · filtered · tap a row for
        detail</span
      >
      <span v-else-if="events.length !== windowTotal"
        >{{ events.length }} of {{ fmtInt(windowTotal) }} events · tap a row for detail</span
      >
      <span v-else>{{ events.length }} events · tap a row for detail</span>
      <TableFilterHead
        :open="open"
        :active="activeCols.size"
        @toggle="open = !open"
        @clear="clear"
      />
    </h2>
    <div class="tablefill">
      <div class="tablewrap">
        <table class="cat">
          <thead>
            <tr>
              <th
                v-for="c in COLS"
                :key="c.key"
                :class="{ fon: activeCols.has(c.key) }"
                :aria-sort="ariaSort(c.key)"
                @click="sortBy(c.key)"
              >
                {{ c.label
                }}<template v-if="c.key === 'time'">
                  ({{ zone === "utc" ? "UTC" : "local" }})</template
                >
              </th>
            </tr>
            <tr v-if="open" class="frow">
              <th>
                <span class="dates">
                  <input
                    ref="sinceEl"
                    type="date"
                    :class="{ set: filter.since !== null }"
                    :value="filter.since ?? ''"
                    :min="bounds.min"
                    :max="bounds.max"
                    aria-label="Time from"
                    @change="setDates"
                  />
                  <input
                    ref="untilEl"
                    type="date"
                    :class="{ set: filter.until !== null }"
                    :value="filter.until ?? ''"
                    :min="bounds.min"
                    :max="bounds.max"
                    aria-label="Time to"
                    @change="setDates"
                  />
                </span>
              </th>
              <th>
                <RangeInputs
                  :min="filter.minMag"
                  :max="filter.maxMag"
                  label="Magnitude"
                  step="0.1"
                  @update="setMag"
                />
              </th>
              <th>
                <RangeInputs
                  :min="filter.minDepth"
                  :max="filter.maxDepth"
                  label="Depth"
                  step="1"
                  placeholder-max="max km"
                  @update="setDepth"
                />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in rows"
              :key="e.id"
              class="ev"
              :class="{ sel: e.id === selectedId }"
              :data-id="e.id"
              tabindex="0"
              @click="select(e.id)"
              @keydown.enter="select(e.id)"
            >
              <td class="num">{{ fmtStamp(e.time, zone, { date: "monthday", label: false }) }}</td>
              <td class="num">
                {{ fmtMag(e.mag)
                }}<span v-if="e.magType !== null" class="magtype">{{ e.magType }}</span>
              </td>
              <td class="num">
                <span class="dchip" :style="{ background: depthColor(e.depthKm) }"></span
                >{{ e.depthKm === null ? "—" : e.depthKm.toFixed(0) }}
              </td>
              <td>
                {{ placeOf(e) }}<span v-if="tag(e) !== null" class="mt"> {{ tag(e) }}</span>
                <span v-if="e.eventType !== null && e.eventType !== 'earthquake'" class="pill">{{
                  e.eventType
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
