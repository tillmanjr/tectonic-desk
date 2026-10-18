<script setup lang="ts">
import EruptionDecadeChart from "./EruptionDecadeChart.vue";
import VeiChart from "./VeiChart.vue";
import VolcanoCards from "./VolcanoCards.vue";
import VolcanoFilterBar from "./VolcanoFilterBar.vue";
import VolcanoMap from "./VolcanoMap.vue";
import VolcanoTable from "./VolcanoTable.vue";
import VolcanoTiles from "./VolcanoTiles.vue";
import { SETTINGS, useInjected, VOLCANOES } from "../lib/keys.js";

const store = useInjected(VOLCANOES);
const settings = useInjected(SETTINGS);
</script>

<template>
  <div v-if="store.error.value !== null" class="banner error" role="alert">
    <span>{{ store.error.value }}</span>
    <button type="button" @click="store.load()">Retry</button>
  </div>
  <VolcanoTiles />
  <VolcanoCards :rows="settings.current.value.cardRows.alone" />
  <VolcanoFilterBar />
  <VolcanoMap />
  <section class="grid2">
    <VolcanoTable />
    <div class="charts">
      <EruptionDecadeChart />
      <VeiChart />
    </div>
  </section>
</template>
