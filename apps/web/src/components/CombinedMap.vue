<script setup lang="ts">
import { computed } from "vue";
import AnimationBar from "./AnimationBar.vue";
import MapDensity from "./MapDensity.vue";
import MapEvents from "./MapEvents.vue";
import MapShake from "./MapShake.vue";
import MapShell from "./MapShell.vue";
import ShakeLegendRow from "./ShakeLegendRow.vue";
import ShakeToggle from "./ShakeToggle.vue";
import MapVolcanoes from "./MapVolcanoes.vue";
import VolcanoLegendRows from "./VolcanoLegendRows.vue";
import {
  API,
  CATALOG,
  CLOCK,
  PINS,
  SECTION,
  SELECT,
  SELECT_VOLCANO,
  SET_SECTION,
  useInjected,
  VOLCANOES,
  ZONE,
} from "../lib/keys.js";
import { useQuakeLayer, useShakeLayer, useVolcanoLayer } from "../lib/layers.js";
import { vHint } from "../lib/hint.js";
import { useMapView } from "../lib/mapview.js";

/** Both datasets on one map: volcano triangles under the earthquake markers, both toolsets. */
const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const store = useInjected(VOLCANOES);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const select = useInjected(SELECT);
const selectVolcano = useInjected(SELECT_VOLCANO);

const mv = useMapView({
  api,
  region: () => catalog.requireRegion(),
  animate: () => props.animate,
  section: useInjected(SECTION),
  setSection: useInjected(SET_SECTION),
  pins: useInjected(PINS),
});
const q = useQuakeLayer({ catalog, clock, zone, mv });
const shake = useShakeLayer({ api, catalog, mv });
const busy = computed(() => {
  const parts = [
    catalog.loading.value ? "events" : null,
    store.loading.value ? "volcanoes" : null,
  ].filter((p) => p !== null);
  return parts.length === 0 ? null : `Loading ${parts.join(" and ")}…`;
});
const v = useVolcanoLayer({ store, mv });
const countLine = computed(
  () => `${q.countLine.value} · ${v.countLine.value.replace(/^Showing /, "")}`,
);
</script>

<template>
  <MapShell
    :busy="busy"
    :mv="mv"
    label="Map of earthquake epicenters and Holocene volcanoes"
    :count-line="countLine"
    :density="q.densityLegend.value"
    :floor="catalog.floor.value"
  >
    <template #tools>
      <label
        v-if="q.density.value !== null"
        v-hint="
          'Shades grid cells by the number of events in the window at the requested magnitude, including those below the raised marker floor. Offered only when a long window raised the floor.'
        "
        data-tour="map.density"
        ><input v-model="q.showDensity.value" type="checkbox" /> Density</label
      >
      <label
        v-hint="
          'Draws a lower-hemisphere beachball (compressional quadrants filled) in place of the dot for events with a moment tensor or focal mechanism.'
        "
        data-tour="map.page map.mech"
        ><input v-model="q.showMech.value" type="checkbox" /> Focal mechanisms</label
      >
      <ShakeToggle :shake="shake" data-tour="map.page map.shake" />
    </template>
    <template #actions>
      <button
        v-hint="'Replay the loaded window on the map, step by step'"
        type="button"
        class="zbtn"
        data-tour="map.page map.animate"
        style="width: auto; padding: 0 8px"
        :aria-pressed="q.anim.active.value"
        @click="q.anim.active.value ? q.anim.close() : q.openAnimation()"
      >
        Animate
      </button>
    </template>
    <template #bar>
      <AnimationBar
        :anim="q.anim"
        :shown="q.shown.value.length"
        :total="catalog.filtered.value.length"
      />
    </template>
    <template #layers="{ frame, k, minRadius }">
      <MapDensity
        v-if="q.density.value !== null && q.showDensity.value"
        :path="mv.view.value.path"
        :grid="q.density.value"
      />
      <MapShake v-if="shake.map.value !== null" :path="mv.view.value.path" :map="shake.map.value" />
      <MapVolcanoes
        v-if="!store.hideMarkers.value"
        :frame="frame"
        :volcanoes="store.filtered.value"
        :k="k"
        :selected="store.selectedNumber.value"
        :ring-of="v.ringOf"
        :continuing="store.continuing.value"
        :min-radius="minRadius"
        @select="selectVolcano"
        @hover="v.onHover"
        @leave="mv.clearTip()"
      />
      <MapEvents
        v-if="!catalog.hideMarkers.value"
        :frame="frame"
        :events="q.shown.value"
        :k="k"
        :selected-id="catalog.selectedId.value"
        :show-mech="q.showMech.value"
        :min-mag="catalog.floor.value"
        :min-radius="minRadius"
        @select="select"
        @hover="q.onHover"
        @leave="mv.clearTip()"
      />
    </template>
    <template #legend>
      <ShakeLegendRow v-if="shake.map.value !== null" :map="shake.map.value" />
      <VolcanoLegendRows />
    </template>
  </MapShell>
</template>
