<script setup lang="ts">
import CatalogTable from "./CatalogTable.vue";
import CombinedMap from "./CombinedMap.vue";
import DepthChart from "./DepthChart.vue";
import EruptionDecadeChart from "./EruptionDecadeChart.vue";
import FilterBar from "./FilterBar.vue";
import FrequencyMagnitudeChart from "./FrequencyMagnitudeChart.vue";
import MagnitudeTimeChart from "./MagnitudeTimeChart.vue";
import MajorEvents from "./MajorEvents.vue";
import StatsStrip from "./StatsStrip.vue";
import VeiChart from "./VeiChart.vue";
import VolcanoCards from "./VolcanoCards.vue";
import VolcanoFilterBar from "./VolcanoFilterBar.vue";
import VolcanoTable from "./VolcanoTable.vue";
import VolcanoTiles from "./VolcanoTiles.vue";
import { SETTINGS, useInjected, VOLCANOES } from "../lib/keys.js";

/** Earthquakes and volcanoes together: both summaries, both card rows, both refine bars, one map, both analyses. */
const store = useInjected(VOLCANOES);
const settings = useInjected(SETTINGS);
</script>

<template>
  <div v-if="store.error.value !== null" class="banner error" role="alert">
    <span>{{ store.error.value }}</span>
    <button type="button" @click="store.load()">Retry</button>
  </div>
  <StatsStrip />
  <VolcanoTiles />
  <MajorEvents :rows="settings.current.value.cardRows.combined" trim="quakes" />
  <VolcanoCards :rows="settings.current.value.cardRows.combined" trim="volcanoes" />
  <FilterBar />
  <VolcanoFilterBar />
  <CombinedMap />
  <p class="sectionlabel">Earthquakes</p>
  <section class="grid2">
    <CatalogTable />
    <div class="charts">
      <MagnitudeTimeChart />
      <FrequencyMagnitudeChart />
      <DepthChart />
    </div>
  </section>
  <p class="sectionlabel">Volcanoes</p>
  <section class="grid2">
    <VolcanoTable />
    <div class="charts">
      <EruptionDecadeChart />
      <VeiChart />
    </div>
  </section>
</template>
