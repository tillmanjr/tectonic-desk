<script setup lang="ts">
import type { ApiEvent, Volcano } from "@tectonic/shared";
import { computed, ref, watch } from "vue";
import MapEvents from "./MapEvents.vue";
import MapShell from "./MapShell.vue";
import MapVolcanoes from "./MapVolcanoes.vue";
import { fmtMag, fmtShort, placeOf } from "../lib/format.js";
import { API, CATALOG, SELECT, SELECT_VOLCANO, useInjected, VOLCANOES, ZONE } from "../lib/keys.js";
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
const select = useInjected(SELECT);
const selectVolcano = useInjected(SELECT_VOLCANO);
const zone = useInjected(ZONE);

const mv = useMapView({
  api,
  region: () => catalog.requireRegion(),
  animate: () => props.animate,
});

/** Recent earthquakes under the volcanoes: on by default in the regional view, off in the global one. */
const showQuakes = ref(mv.view.value.region.bbox !== null);
watch(
  () => mv.view.value.region.id,
  () => {
    showQuakes.value = mv.view.value.region.bbox !== null;
  },
);

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
function onQuakeHover(payload: { e: ApiEvent; x: number; y: number }): void {
  const { e } = payload;
  const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
  mv.showTip(
    `M${fmtMag(e.mag)} · ${depth} km · ${placeOf(e)} · ${fmtShort(e.time, zone.value)}`,
    payload.x,
    payload.y,
  );
}

watch(store.selected, (v) => {
  if (v !== null) mv.zoomTo(v.lon, v.lat);
});
</script>

<template>
  <MapShell :mv="mv" label="Map of Holocene volcanoes" :count-line="countLine">
    <template #tools>
      <label><input v-model="showQuakes" type="checkbox" /> Recent earthquakes</label>
    </template>
    <template #layers="{ frame, k, minRadius }">
      <g v-if="showQuakes" class="quakes-muted" opacity="0.45">
        <MapEvents
          :frame="frame"
          :events="catalog.filtered.value"
          :k="k"
          :selected-id="catalog.selectedId.value"
          :show-mech="false"
          :min-mag="mv.view.value.minMag"
          :min-radius="minRadius"
          @select="select"
          @hover="onQuakeHover"
          @leave="mv.clearTip()"
        />
      </g>
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
        >Point at a volcano for its type, last eruption and status; click for its history. Recent
        earthquakes are the earthquake page's filtered events, drawn faint.</span
      >
    </template>
  </MapShell>
</template>
