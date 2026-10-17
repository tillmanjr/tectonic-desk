<script setup lang="ts">
import { computed } from "vue";
import RefineBar from "./RefineBar.vue";
import { SET_VOLCANO_FILTER, useInjected, VOLCANOES } from "../lib/keys.js";
import { volcanoParts } from "../lib/refine.js";
import {
  EMPTY_VOLCANO_FILTER,
  ERUPTION_CLASS_CODES,
  ERUPTION_CLASSES,
  isVolcanoFilterActive,
  SETTING_GROUP_CODES,
  SETTING_GROUPS,
  STATUS_FILTER_CODES,
  STATUS_FILTERS,
  TYPE_GROUP_CODES,
  TYPE_GROUPS,
  type VolcanoFilter,
} from "../lib/volcanoes.js";

const store = useInjected(VOLCANOES);
const setFilter = useInjected(SET_VOLCANO_FILTER);
const active = computed(() => isVolcanoFilterActive(store.filter.value));
const parts = computed(() => volcanoParts(store.filter.value));

const settings = SETTING_GROUP_CODES.map((c) => ({ value: c, label: SETTING_GROUPS[c] }));
const types = TYPE_GROUP_CODES.map((c) => ({ value: c, label: TYPE_GROUPS[c] }));
const ages = ERUPTION_CLASS_CODES.map((c) => ({ value: c, label: ERUPTION_CLASSES[c].label }));
const statuses = STATUS_FILTER_CODES.map((c) => ({ value: c, label: STATUS_FILTERS[c] }));

function selected(ev: Event): string {
  const t = ev.target;
  return t instanceof HTMLSelectElement ? t.value : "";
}
function change(key: keyof VolcanoFilter, ev: Event): void {
  const v = selected(ev);
  const next = { ...store.filter.value, [key]: v === "" ? null : v };
  setFilter(next);
}
</script>

<template>
  <RefineBar
    dataset="volcanoes"
    :parts="parts"
    :hidden="store.hideMarkers.value"
    @update:hidden="store.hideMarkers.value = $event"
  >
    <template #info>
      <span
        class="finfo"
        role="img"
        aria-label="These settings refine the map, table and charts; the summary tiles and cards are unaffected"
        title="These settings refine the map, table and charts. The summary tiles and cards are unaffected."
        >i</span
      >
    </template>
    <label class="fsel"
      >Setting
      <select :value="store.filter.value.setting ?? ''" @change="change('setting', $event)">
        <option value="">any</option>
        <option v-for="o in settings" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="fsel"
      >Type
      <select :value="store.filter.value.type ?? ''" @change="change('type', $event)">
        <option value="">any</option>
        <option v-for="o in types" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="fsel"
      >Last eruption
      <select :value="store.filter.value.age ?? ''" @change="change('age', $event)">
        <option value="">any</option>
        <option v-for="o in ages" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="fsel"
      >Status
      <select :value="store.filter.value.status ?? ''" @change="change('status', $event)">
        <option value="">any</option>
        <option v-for="o in statuses" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <button
      type="button"
      class="fclear"
      :disabled="!active"
      @click="setFilter(EMPTY_VOLCANO_FILTER)"
    >
      Reset
    </button>
  </RefineBar>
</template>
