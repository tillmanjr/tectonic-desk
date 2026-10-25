<script setup lang="ts">
import CatalogTable from "./CatalogTable.vue";
import DepthChart from "./DepthChart.vue";
import FilterBar from "./FilterBar.vue";
import FrequencyMagnitudeChart from "./FrequencyMagnitudeChart.vue";
import MagnitudeTimeChart from "./MagnitudeTimeChart.vue";
import MajorEvents from "./MajorEvents.vue";
import QuakeMap from "./QuakeMap.vue";
import SectionProfile from "./SectionProfile.vue";
import StatsStrip from "./StatsStrip.vue";
import { SETTINGS, useInjected } from "../lib/keys.js";

const settings = useInjected(SETTINGS);
</script>

<template>
  <StatsStrip />
  <MajorEvents :rows="settings.current.value.cardRows.alone" />
  <FilterBar />
  <QuakeMap />
  <SectionProfile />
  <section class="grid2">
    <CatalogTable />
    <div class="charts">
      <MagnitudeTimeChart />
      <FrequencyMagnitudeChart />
      <DepthChart />
    </div>
  </section>
</template>
