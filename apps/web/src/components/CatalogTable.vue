<script setup lang="ts">
import type { ApiEvent } from "@tectonic/shared";
import { computed, ref } from "vue";
import { depthColor } from "../lib/depth.js";
import { fmtMag, fmtStamp, placeOf } from "../lib/format.js";
import { CATALOG, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { preferredMechanism } from "../lib/stats.js";

type SortKey = "time" | "mag" | "depthKm" | "place";
const COLS: { key: SortKey; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "mag", label: "M" },
  { key: "depthKm", label: "Depth" },
  { key: "place", label: "Location" },
];

const { events: all, filtered: events, selectedId } = useInjected(CATALOG);
const select = useInjected(SELECT);
const zone = useInjected(ZONE);
const sortKey = ref<SortKey>("time");
const sortDir = ref<1 | -1>(-1);

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
  [...events.value].sort((a, b) => {
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
  <div class="panel">
    <h2>
      Catalog
      <span v-if="events.length !== all.length"
        >{{ events.length }} of {{ all.length }} events · tap a row for detail</span
      >
      <span v-else>{{ events.length }} events · tap a row for detail</span>
    </h2>
    <div class="tablewrap">
      <table class="cat">
        <thead>
          <tr>
            <th v-for="c in COLS" :key="c.key" :aria-sort="ariaSort(c.key)" @click="sortBy(c.key)">
              {{ c.label
              }}<template v-if="c.key === 'time'">
                ({{ zone === "utc" ? "UTC" : "local" }})</template
              >
            </th>
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
</template>
