<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, provide, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CatalogTable from "./CatalogTable.vue";
import DepthChart from "./DepthChart.vue";
import DetailPanel from "./DetailPanel.vue";
import FrequencyMagnitudeChart from "./FrequencyMagnitudeChart.vue";
import MagnitudeTimeChart from "./MagnitudeTimeChart.vue";
import MajorEvents from "./MajorEvents.vue";
import QuakeMap from "./QuakeMap.vue";
import RegionTabs from "./RegionTabs.vue";
import StatsStrip from "./StatsStrip.vue";
import StatusLine from "./StatusLine.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { createApiClient } from "../lib/api.js";
import { clearBeachballCache } from "../lib/beachball.js";
import { createCatalog, EVENT_LIMIT } from "../lib/catalog.js";
import { createClock } from "../lib/clock.js";
import { API, CATALOG, CLOCK, SELECT, STATUS, THEME } from "../lib/keys.js";
import { majorLabel } from "../lib/stats.js";
import { createStatusPoll } from "../lib/status.js";
import { createTheme } from "../lib/theme.js";

const api = inject(API, null) ?? createApiClient((input, init) => fetch(input, init));
const clock = inject(CLOCK, null) ?? createClock();
const theme = inject(THEME, null) ?? createTheme();
const now = (): Date => clock.now.value;
const catalog = createCatalog(api, now);
const status = createStatusPoll(api, now, () => {
  void catalog.refetch();
});

provide(API, api);
provide(CLOCK, clock);
provide(THEME, theme);
provide(CATALOG, catalog);
provide(STATUS, status);
provide(SELECT, select);

const route = useRoute();
const router = useRouter();
const { region, error, truncated } = catalog;

const routeRegion = computed(() => {
  const p = route.params.region;
  return typeof p === "string" && p !== "" ? p : "global";
});
const routeEvent = computed(() => {
  const q = route.query.event;
  return typeof q === "string" ? q : null;
});

async function applyRegion(id: string): Promise<void> {
  const ok = await catalog.setRegion(id);
  if (!ok && catalog.regions.value.length > 0) await router.replace("/");
}
async function boot(): Promise<void> {
  await catalog.init();
  await applyRegion(routeRegion.value);
  catalog.select(routeEvent.value);
}
function pickRegion(id: string): void {
  void router.push(id === "global" ? "/" : `/${id}`);
}
function select(id: string | null): void {
  const query = { ...route.query };
  if (id === null) delete query.event;
  else query.event = id;
  void router.replace({ query });
}
function retry(): void {
  if (catalog.regions.value.length === 0) void boot();
  else void catalog.refetch();
}

watch(routeRegion, (id) => {
  void applyRegion(id);
});
watch(routeEvent, (id) => {
  catalog.select(id);
});
watch(theme.resolved, () => {
  clearBeachballCache();
});
onMounted(() => {
  clock.start();
  status.start();
  void boot();
});
onUnmounted(() => {
  clock.stop();
  status.stop();
});
</script>

<template>
  <div class="wrap">
    <header>
      <div>
        <h1>Tectonic Desk<small>Earthquakes · focal mechanisms · plate boundaries</small></h1>
      </div>
      <div class="hdr-right">
        <RegionTabs @pick="pickRegion" />
        <ThemeToggle />
      </div>
    </header>
    <StatusLine />
    <div v-if="error !== null" class="banner error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="retry">Retry</button>
    </div>
    <div v-if="truncated" class="banner">
      Showing the newest {{ EVENT_LIMIT }} events; the window holds more. Narrow the window or raise
      the limit.
    </div>
    <template v-if="region !== null">
      <StatsStrip />
      <p class="sectionlabel">{{ majorLabel(region) }}</p>
      <MajorEvents />
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
    <footer class="foot">
      <p>
        <b>Data.</b> Earthquake parameters from the USGS ANSS Comprehensive Catalog (ComCat), polled
        every five minutes and kept in this site's own history. Mechanisms are USGS products (moment
        tensor where available, otherwise first-motion focal mechanism), drawn as lower-hemisphere
        equal-area projections with compressional quadrants shaded. Where a solution reports only P
        and T axes, the double couple is reconstructed from those axes and labelled as such. Tensors
        can lag an origin by hours.
      </p>
      <p>
        <b>Plate boundaries.</b> Bird (2003), <i>An updated digital model of plate boundaries</i>,
        G³ 4(3), 1027 (PB2002), via the fraxen/tectonicplates repository; segment class and relative
        velocity from the PB2002 step file. Basemap: Natural Earth via world-atlas and us-atlas.
      </p>
    </footer>
  </div>
  <DetailPanel />
</template>
