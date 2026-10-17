<script setup lang="ts">
import CatalogTable from "./CatalogTable.vue";
import DepthChart from "./DepthChart.vue";
import FilterBar from "./FilterBar.vue";
import FrequencyMagnitudeChart from "./FrequencyMagnitudeChart.vue";
import MagnitudeTimeChart from "./MagnitudeTimeChart.vue";
import MajorEvents from "./MajorEvents.vue";
import QuakeMap from "./QuakeMap.vue";
import StatsStrip from "./StatsStrip.vue";
import { CATALOG, useInjected } from "../lib/keys.js";
import { majorLabel } from "../lib/stats.js";

const catalog = useInjected(CATALOG);
</script>

<template>
  <StatsStrip />
  <p class="sectionlabel">{{ majorLabel(catalog.requireRegion()) }}</p>
  <MajorEvents />
  <FilterBar />
  <QuakeMap />
  <section class="grid2">
    <CatalogTable />
    <div class="charts">
      <MagnitudeTimeChart />
      <FrequencyMagnitudeChart />
      <DepthChart />
    </div>
  </section>
</template>
