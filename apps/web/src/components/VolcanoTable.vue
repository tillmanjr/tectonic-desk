<script setup lang="ts">
import type { ApiVolcanoStatus, Volcano } from "@tectonic/shared";
import { computed, ref } from "vue";
import { SELECT_VOLCANO, useInjected, VOLCANOES } from "../lib/keys.js";
import {
  ERUPTION_CLASSES,
  eruptionClass,
  statusLabel,
  statusRank,
  TYPE_GROUPS,
  typeGroup,
} from "../lib/volcanoes.js";

type SortKey = "status" | "name" | "country" | "type" | "last" | "elevation";
const COLS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Volcano" },
  { key: "country", label: "Country" },
  { key: "type", label: "Type" },
  { key: "last", label: "Last eruption" },
  { key: "status", label: "Status" },
  { key: "elevation", label: "Elev. m" },
];
interface Row {
  v: Volcano;
  top: ApiVolcanoStatus | null;
}

const store = useInjected(VOLCANOES);
const selectVolcano = useInjected(SELECT_VOLCANO);
const sortKey = ref<SortKey>("status");
const sortDir = ref<1 | -1>(-1);

function sortBy(k: SortKey): void {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = k;
    sortDir.value = k === "name" || k === "country" || k === "type" ? 1 : -1;
  }
}
function topStatus(v: Volcano): ApiVolcanoStatus | null {
  const list = store.statusesOf.value.get(v.number) ?? [];
  return [...list].sort((a, b) => statusRank(b) - statusRank(a))[0] ?? null;
}
function value(v: Volcano): string | number {
  switch (sortKey.value) {
    case "name":
      return v.name;
    case "country":
      return v.country;
    case "type":
      return TYPE_GROUPS[typeGroup(v.type)];
    case "last":
      return v.lastEruptionYear ?? -Infinity;
    case "elevation":
      return v.elevationM ?? -Infinity;
    default:
      return store.rankOf(v.number);
  }
}
const rows = computed<Row[]>(() =>
  [...store.filtered.value]
    .sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return c !== 0 ? c * sortDir.value : a.name.localeCompare(b.name);
    })
    .map((v) => ({ v, top: topStatus(v) })),
);
const lastText = (v: Volcano): string =>
  v.lastEruptionYear === null
    ? "unknown"
    : v.lastEruptionYear > 0
      ? String(v.lastEruptionYear)
      : `${String(1 - v.lastEruptionYear)} BCE`;
const ariaSort = (k: SortKey): "ascending" | "descending" | undefined =>
  k === sortKey.value ? (sortDir.value === 1 ? "ascending" : "descending") : undefined;
</script>

<template>
  <div class="panel">
    <h2>
      Volcanoes
      <span v-if="store.filtered.value.length !== store.inRegion.value.length"
        >{{ store.filtered.value.length }} of {{ store.inRegion.value.length }} · tap a row for
        detail</span
      >
      <span v-else>{{ store.filtered.value.length }} in this view · tap a row for detail</span>
    </h2>
    <div class="tablewrap">
      <table class="cat">
        <thead>
          <tr>
            <th v-for="c in COLS" :key="c.key" :aria-sort="ariaSort(c.key)" @click="sortBy(c.key)">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.v.number"
            class="ev"
            :class="{ sel: r.v.number === store.selectedNumber.value }"
            :data-number="r.v.number"
            tabindex="0"
            @click="selectVolcano(r.v.number)"
            @keydown.enter="selectVolcano(r.v.number)"
          >
            <td>
              <span
                class="dchip"
                :style="{
                  background: ERUPTION_CLASSES[eruptionClass(r.v.lastEruptionYear)].color,
                }"
              ></span
              >{{ r.v.name }}
            </td>
            <td>{{ r.v.country }}</td>
            <td>{{ TYPE_GROUPS[typeGroup(r.v.type)] }}</td>
            <td class="num">{{ lastText(r.v) }}</td>
            <td>
              <template v-if="r.top !== null">{{ statusLabel(r.top) }}</template>
              <span v-else class="muted">not monitored here</span>
            </td>
            <td class="num">{{ r.v.elevationM === null ? "—" : r.v.elevationM }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
