<script setup lang="ts">
import MapShell from "./MapShell.vue";
import MapVolcanoes from "./MapVolcanoes.vue";
import VolcanoLegendRows from "./VolcanoLegendRows.vue";
import {
  API,
  CATALOG,
  SECTION,
  SELECT_VOLCANO,
  SET_SECTION,
  useInjected,
  VOLCANOES,
} from "../lib/keys.js";
import { useVolcanoLayer } from "../lib/layers.js";
import { useMapView } from "../lib/mapview.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const store = useInjected(VOLCANOES);
const selectVolcano = useInjected(SELECT_VOLCANO);

const mv = useMapView({
  api,
  region: () => catalog.requireRegion(),
  animate: () => props.animate,
  section: useInjected(SECTION),
  setSection: useInjected(SET_SECTION),
});
const v = useVolcanoLayer({ store, mv });
</script>

<template>
  <MapShell
    :mv="mv"
    :section-tool="false"
    label="Map of Holocene volcanoes"
    :count-line="v.countLine.value"
    :quakes="false"
  >
    <template #layers="{ frame, k, minRadius }">
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
    </template>
    <template #legend>
      <VolcanoLegendRows />
    </template>
  </MapShell>
</template>
