<script setup lang="ts">
import type { ApiVolcanoStatus, Volcano } from "@tectonic/shared";
import { computed, ref, watch } from "vue";
import RangeInputs from "./RangeInputs.vue";
import TableFilterHead from "./TableFilterHead.vue";
import { SELECT_VOLCANO, useInjected, VOLCANOES } from "../lib/keys.js";
import {
  activeVolcanoColumns,
  applyVolcanoTableFilter,
  countriesOf,
  EMPTY_VOLCANO_TABLE_FILTER,
  type VolcanoTableFilter,
} from "../lib/table-filters.js";
import {
  ERUPTION_CLASSES,
  eruptionClass,
  statusLabel,
  statusRank,
  TYPE_GROUP_CODES,
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

/** The table's own column filter: narrows the rows only, resets with the region. */
const filter = ref<VolcanoTableFilter>(EMPTY_VOLCANO_TABLE_FILTER);
const open = ref(false);
const activeCols = computed<Set<string>>(() => activeVolcanoColumns(filter.value));
const narrowed = computed(() => applyVolcanoTableFilter(store.filtered.value, filter.value));
const countries = computed(() => countriesOf(store.inRegion.value));
const nameEl = ref<HTMLInputElement | null>(null);
const countryEl = ref<HTMLSelectElement | null>(null);
const typeEl = ref<HTMLSelectElement | null>(null);

function setName(): void {
  const v = nameEl.value?.value.trim() ?? "";
  filter.value = { ...filter.value, name: v === "" ? null : v };
}
function setCountry(): void {
  const v = countryEl.value?.value ?? "";
  filter.value = { ...filter.value, country: v === "" ? null : v };
}
function setType(): void {
  const v = typeEl.value?.value;
  filter.value = { ...filter.value, type: TYPE_GROUP_CODES.find((c) => c === v) ?? null };
}
function setYears(r: { min: number | null; max: number | null }): void {
  filter.value = { ...filter.value, minYear: r.min, maxYear: r.max };
}
function setElevation(r: { min: number | null; max: number | null }): void {
  filter.value = { ...filter.value, minElev: r.min, maxElev: r.max };
}
function clear(): void {
  filter.value = EMPTY_VOLCANO_TABLE_FILTER;
}
watch(
  () => store.region.value?.id,
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
  [...narrowed.value]
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
  <div class="panel tablepanel">
    <h2 class="withfilter">
      Volcanoes
      <span v-if="activeCols.size > 0"
        >{{ narrowed.length }} of {{ store.inRegion.value.length }} · filtered · tap a row for
        detail</span
      >
      <span v-else-if="store.filtered.value.length !== store.inRegion.value.length"
        >{{ store.filtered.value.length }} of {{ store.inRegion.value.length }} · tap a row for
        detail</span
      >
      <span v-else>{{ store.filtered.value.length }} in this view · tap a row for detail</span>
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
                {{ c.label }}
              </th>
            </tr>
            <tr v-if="open" class="frow">
              <th>
                <input
                  ref="nameEl"
                  type="text"
                  :class="{ set: filter.name !== null }"
                  :value="filter.name ?? ''"
                  placeholder="contains…"
                  aria-label="Volcano name"
                  @change="setName"
                />
              </th>
              <th>
                <select
                  ref="countryEl"
                  :class="{ set: filter.country !== null }"
                  :value="filter.country ?? ''"
                  aria-label="Country"
                  @change="setCountry"
                >
                  <option value="">any</option>
                  <option v-for="c in countries" :key="c" :value="c">{{ c }}</option>
                </select>
              </th>
              <th>
                <select
                  ref="typeEl"
                  :class="{ set: filter.type !== null }"
                  :value="filter.type ?? ''"
                  aria-label="Type"
                  @change="setType"
                >
                  <option value="">any</option>
                  <option v-for="code in TYPE_GROUP_CODES" :key="code" :value="code">
                    {{ TYPE_GROUPS[code] }}
                  </option>
                </select>
              </th>
              <th>
                <RangeInputs
                  :min="filter.minYear"
                  :max="filter.maxYear"
                  label="Last eruption"
                  step="1"
                  placeholder-min="from"
                  placeholder-max="to"
                  @update="setYears"
                />
              </th>
              <th></th>
              <th>
                <RangeInputs
                  :min="filter.minElev"
                  :max="filter.maxElev"
                  label="Elevation"
                  step="1"
                  @update="setElevation"
                />
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
  </div>
</template>
