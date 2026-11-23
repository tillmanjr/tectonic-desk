<script setup lang="ts">
import AnimationBar from "./AnimationBar.vue";
import MapDensity from "./MapDensity.vue";
import MapEvents from "./MapEvents.vue";
import MapShake from "./MapShake.vue";
import MapShell from "./MapShell.vue";
import ShakeLegendRow from "./ShakeLegendRow.vue";
import ShakeToggle from "./ShakeToggle.vue";
import {
  API,
  CATALOG,
  CLOCK,
  PINS,
  SECTION,
  SELECT,
  SET_SECTION,
  useInjected,
  ZONE,
} from "../lib/keys.js";
import { useQuakeLayer, useShakeLayer } from "../lib/layers.js";
import { vHint } from "../lib/hint.js";
import { useMapView } from "../lib/mapview.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const select = useInjected(SELECT);

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
</script>

<template>
  <MapShell
    :mv="mv"
    label="Map of earthquake epicenters"
    :count-line="q.countLine.value"
    :density="q.densityLegend.value"
    :floor="catalog.floor.value"
    :busy="catalog.loading.value ? 'Loading events…' : null"
  >
    <template #tools>
      <label
        v-if="q.density.value !== null"
        v-hint="
          'Shades grid cells by the number of events in the window at the requested magnitude, including those below the raised marker floor. Offered only when a long window raised the floor.'
        "
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
        data-tour="map.page"
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
    </template>
  </MapShell>
</template>
