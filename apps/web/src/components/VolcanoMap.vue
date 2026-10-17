<script setup lang="ts">
import type { Volcano } from "@tectonic/shared";
import { computed, watch } from "vue";
import MapShell from "./MapShell.vue";
import MapVolcanoes from "./MapVolcanoes.vue";
import { API, CATALOG, SELECT_VOLCANO, useInjected, VOLCANOES } from "../lib/keys.js";
import { TIP_LIFT, useMapView } from "../lib/mapview.js";
import {
  aviationColor,
  ERUPTION_CLASSES,
  lastEruptionText,
  statusLabel,
  statusRank,
  TYPE_GROUPS,
  typeGroup,
} from "../lib/volcanoes.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const store = useInjected(VOLCANOES);
const selectVolcano = useInjected(SELECT_VOLCANO);

const mv = useMapView({
  api,
  region: () => catalog.requireRegion(),
  animate: () => props.animate,
});

const countLine = computed(
  () =>
    `Showing ${String(store.filtered.value.length)} of ${String(store.inRegion.value.length)} volcanoes`,
);

/** The ranked status, highest first, that gives a volcano its ring colour. */
function topStatus(number: number) {
  const list = store.statusesOf.value.get(number) ?? [];
  return [...list].sort((a, b) => statusRank(b) - statusRank(a))[0] ?? null;
}
/** The ring colour for a volcano above normal at its agency; null for normal or unmonitored. */
function ringOf(number: number): string | null {
  const top = topStatus(number);
  return top !== null && statusRank(top) > 0 ? aviationColor(top.color) : null;
}

function onVolcanoHover(payload: { v: Volcano; x: number; y: number }): void {
  const { v } = payload;
  const top = topStatus(v.number);
  const parts = [v.name, TYPE_GROUPS[typeGroup(v.type)], lastEruptionText(v)];
  if (top !== null && statusRank(top) > 0) parts.push(statusLabel(top));
  if (store.continuing.value.has(v.number)) parts.push("eruption continuing (GVP)");
  mv.showTip(parts.join(" · "), payload.x, payload.y - TIP_LIFT);
}

watch(store.selected, (v) => {
  if (v !== null) mv.zoomTo(v.lon, v.lat);
});
</script>

<template>
  <MapShell :mv="mv" label="Map of Holocene volcanoes" :count-line="countLine" :quakes="false">
    <template #layers="{ frame, k, minRadius }">
      <MapVolcanoes
        :frame="frame"
        :volcanoes="store.filtered.value"
        :k="k"
        :selected="store.selectedNumber.value"
        :ring-of="ringOf"
        :continuing="store.continuing.value"
        :min-radius="minRadius"
        @select="selectVolcano"
        @hover="onVolcanoHover"
        @leave="mv.clearTip()"
      />
    </template>
    <template #legend>
      <span v-for="(c, code) in ERUPTION_CLASSES" :key="code" class="sw">
        <svg width="14" height="12" aria-hidden="true">
          <path d="M7,1L13,11L1,11Z" :style="{ fill: c.color, stroke: 'var(--ink)' }" />
        </svg>
        {{ c.label }}
      </span>
      <span class="sw">
        <svg width="16" height="16" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            style="stroke: var(--av-orange)"
            stroke-width="2"
          />
        </svg>
        ring: agency alert above normal, in its aviation colour
      </span>
      <span class="sw">
        <svg width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="3" r="2.2" style="fill: var(--vc-recent); stroke: var(--ink)" />
          <path d="M7,6L12,13L2,13Z" style="fill: var(--vc-recent); stroke: var(--ink)" />
        </svg>
        dot above: eruption continuing per GVP
      </span>
      <span class="sw hint-sw"
        >Point at a volcano for its type, last eruption and status; click for its history.</span
      >
    </template>
  </MapShell>
</template>
