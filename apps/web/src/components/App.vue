<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, provide, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import ActiveEarthPage from "./ActiveEarthPage.vue";
import DetailPanel from "./DetailPanel.vue";
import EarthquakesPage from "./EarthquakesPage.vue";
import MarksOverlay from "./MarksOverlay.vue";
import PageSwitch from "./PageSwitch.vue";
import RegionTabs from "./RegionTabs.vue";
import SettingsMenu from "./SettingsMenu.vue";
import StatusLine from "./StatusLine.vue";
import VolcanoDetail from "./VolcanoDetail.vue";
import VolcanoesPage from "./VolcanoesPage.vue";
import { createApiClient } from "../lib/api.js";
import { clearBeachballCache } from "../lib/beachball.js";
import { createCatalog, EVENT_LIMIT } from "../lib/catalog.js";
import { createClock } from "../lib/clock.js";
import {
  dateBoundsFor,
  filterQuery,
  parseFilter,
  rangeInstants,
  resolveDates,
  type EventFilter,
} from "../lib/filters.js";
import type { Zone } from "../lib/format.js";
import {
  API,
  CATALOG,
  CLOCK,
  MARKS,
  MARKS_NAV,
  NOTICE,
  SELECT,
  SELECT_VOLCANO,
  SET_FILTER,
  SET_VOLCANO_FILTER,
  SETTINGS,
  STATUS,
  THEME,
  VOLCANOES,
  ZONE,
  type MarksMode,
  type MarksNav,
} from "../lib/keys.js";
import { hereTarget } from "../lib/marks-nav.js";
import { ALL_GROUP, createMarks, MARK_TERMS } from "../lib/marks.js";
import { createNotice } from "../lib/notice.js";
import { createSettings } from "../lib/settings.js";
import { createStatusPoll } from "../lib/status.js";
import { createTheme } from "../lib/theme.js";
import {
  createVolcanoStore,
  parseVolcanoFilter,
  volcanoFilterQuery,
  type VolcanoFilter,
} from "../lib/volcanoes.js";
import { hasVolcanoes, pageOf, pagePath, type Page } from "../router.js";

const api = inject(API, null) ?? createApiClient((input, init) => fetch(input, init));
const clock = inject(CLOCK, null) ?? createClock();
const theme = inject(THEME, null) ?? createTheme();
const settings = inject(SETTINGS, null) ?? createSettings();
const marks = inject(MARKS, null) ?? createMarks();
const notice = createNotice();
const now = (): Date => clock.now.value;
const catalog = createCatalog(api, now);
const volcanoes = createVolcanoStore(api, now);
const status = createStatusPoll(api, now, () => {
  void catalog.refetch();
  if (hasVolcanoes(page.value)) void volcanoes.refreshLive();
});

provide(API, api);
provide(CLOCK, clock);
provide(THEME, theme);
provide(SETTINGS, settings);
provide(MARKS, marks);
provide(NOTICE, notice);
provide(CATALOG, catalog);
provide(STATUS, status);
provide(VOLCANOES, volcanoes);
provide(SELECT, select);
provide(SET_FILTER, setFilter);
provide(SELECT_VOLCANO, selectVolcano);
provide(SET_VOLCANO_FILTER, setVolcanoFilter);

const route = useRoute();
const router = useRouter();
const { region, error, truncated } = catalog;
const zone = computed<Zone>(() => (route.query.tz === "local" ? "local" : "utc"));
provide(ZONE, zone);

const page = computed(() => pageOf(route.meta.page));

/** Query keys that address the marks overlay; never part of a saved view. */
const OVERLAY_KEYS = ["marks", "show"];
const withoutOverlay = (q: LocationQuery): LocationQuery =>
  Object.fromEntries(Object.entries(q).filter(([k]) => !OVERLAY_KEYS.includes(k)));
/** The query as flat strings: repeated keys keep their first value, which a saved view never has anyway. */
const flatQuery = (q: LocationQuery): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") out[k] = first;
  }
  return out;
};
const viewUrl = computed(
  () => router.resolve({ path: route.path, query: withoutOverlay(route.query) }).fullPath,
);
const routeRegion = computed(() => {
  const p = route.params.region;
  return typeof p === "string" && p !== "" ? p : "global";
});
const overlay = computed(() => {
  const g = route.query.marks;
  if (typeof g !== "string" || g === "") return null;
  const show = route.query.show;
  const mode: MarksMode = show === "panels" || show === "matrix" ? show : "list";
  return { group: g, mode };
});
const listQuery = (group: string): LocationQuery => ({
  ...withoutOverlay(route.query),
  marks: group,
});
const nav: MarksNav = {
  viewUrl,
  overlay,
  open: (group = ALL_GROUP) => void router.push({ query: listQuery(group) }),
  list: (group) => void router.push({ query: listQuery(group) }),
  show: (group) => void router.push({ query: { ...listQuery(group), show: "panels" } }),
  compare: (group) => void router.push({ query: { ...listQuery(group), show: "matrix" } }),
  close: () => void router.replace({ query: withoutOverlay(route.query) }),
  goTo: (url) => void router.push(url),
  openHere: (mark) => {
    const t = hereTarget(page.value, routeRegion.value, flatQuery(withoutOverlay(route.query)), mark);
    void router.push(t.url);
    if (t.switched) notice.post("Switching to Active Earth");
  },
};
provide(MARKS_NAV, nav);
const routeEvent = computed(() => {
  const q = route.query.event;
  return typeof q === "string" ? q : null;
});
const routeVolcano = computed(() => {
  const q = route.query.volcano;
  const n = typeof q === "string" ? Number(q) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
});
const routeFilter = computed(() =>
  parseFilter(route.query, region.value?.minMag ?? 0, dateBoundsFor(clock.now.value, zone.value)),
);
/** The window the route asks for: explicit dates, else the default trailing days up to today. */
const routeRange = computed(() =>
  rangeInstants(resolveDates(routeFilter.value, clock.now.value, zone.value), zone.value),
);
const routeVolcanoFilter = computed(() => parseVolcanoFilter(route.query));

async function applyRegion(id: string): Promise<void> {
  const ok = await catalog.setRegion(id);
  if (!ok && catalog.regions.value.length > 0) {
    await router.replace(pagePath(page.value, "global"));
  }
}
async function boot(): Promise<void> {
  await catalog.init();
  catalog.setRange(routeRange.value);
  await applyRegion(routeRegion.value);
  catalog.select(routeEvent.value);
  catalog.setFilter(routeFilter.value);
  volcanoes.setRegion(region.value);
  volcanoes.setFilter(routeVolcanoFilter.value);
  volcanoes.select(routeVolcano.value);
  if (hasVolcanoes(page.value)) await volcanoes.load();
}
/** Query keys that belong to one page's selection; dropped when moving between pages or regions. */
const SELECTION_KEYS = ["event", "volcano"];
const withoutSelection = () =>
  Object.fromEntries(Object.entries(route.query).filter(([k]) => !SELECTION_KEYS.includes(k)));
function pickRegion(id: string): void {
  void router.push({ path: pagePath(page.value, id), query: withoutSelection() });
}
function pickPage(p: Page): void {
  if (p === page.value) return;
  void router.push({ path: pagePath(p, routeRegion.value), query: withoutSelection() });
}
function setFilter(f: EventFilter): void {
  void router.replace({ query: { ...route.query, ...filterQuery(f) } });
}
function setVolcanoFilter(f: VolcanoFilter): void {
  void router.replace({ query: { ...route.query, ...volcanoFilterQuery(f) } });
}
function toggleZone(): void {
  const query = { ...route.query };
  if (zone.value === "utc") query.tz = "local";
  else delete query.tz;
  void router.replace({ query });
}
function select(id: string | null): void {
  const query = { ...route.query };
  if (id === null) delete query.event;
  else {
    query.event = id;
    delete query.volcano;
  }
  void router.replace({ query });
}
function selectVolcano(number: number | null): void {
  const query = { ...route.query };
  if (number === null) delete query.volcano;
  else {
    query.volcano = String(number);
    delete query.event;
  }
  void router.replace({ query });
}
function retry(): void {
  if (catalog.regions.value.length === 0) void boot();
  else void catalog.refetch();
}

watch(routeRegion, (id) => {
  void applyRegion(id);
});
watch(region, (r) => {
  volcanoes.setRegion(r);
});
watch(routeEvent, (id) => {
  catalog.select(id);
});
watch(routeVolcano, (n) => {
  volcanoes.select(n);
});
watch(routeFilter, (f) => {
  catalog.setFilter(f);
});
watch(routeVolcanoFilter, (f) => {
  volcanoes.setFilter(f);
});
watch(routeRange, (r) => {
  catalog.setRange(r);
});
watch(page, (p) => {
  if (hasVolcanoes(p)) void volcanoes.load();
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
    <div class="topbar">
      <header>
        <div class="hdr-left">
          <h1>Tectonic Desk<small>Earthquakes · volcanoes · plate boundaries</small></h1>
        </div>
        <nav class="tools" aria-label="Controls">
          <div class="grp">
            <PageSwitch :page="page" @pick="pickPage" />
            <nav class="pages" :aria-label="MARK_TERMS.title">
              <button
                type="button"
                class="marks-btn"
                aria-haspopup="dialog"
                :aria-current="overlay !== null ? 'page' : undefined"
                :title="`Your marked ${MARK_TERMS.things}, over the current page`"
                @click="nav.open()"
              >
                {{ MARK_TERMS.noun
                }}{{ marks.marks.value.length > 0 ? ` · ${String(marks.marks.value.length)}` : "" }}
              </button>
            </nav>
          </div>
          <div class="grp">
            <RegionTabs @pick="pickRegion" />
            <SettingsMenu :zone="zone" @toggle-zone="toggleZone" />
          </div>
        </nav>
      </header>
      <StatusLine />
    </div>
    <div v-if="error !== null" class="banner error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="retry">Retry</button>
    </div>
    <div v-if="truncated" class="banner">
      Showing the newest {{ EVENT_LIMIT }} events; the window holds more. Narrow the window or raise
      the limit.
    </div>
    <template v-if="region !== null">
      <EarthquakesPage v-if="page === 'earthquakes'" />
      <VolcanoesPage v-else-if="page === 'volcanoes'" />
      <ActiveEarthPage v-else />
    </template>
    <footer class="foot">
      <p>
        <b>Data.</b> Earthquake parameters from the USGS ANSS Comprehensive Catalog (ComCat), polled
        every five minutes and kept in this site's own history. Mechanisms are USGS products (moment
        tensor where available, otherwise first-motion focal mechanism), drawn as lower-hemisphere
        equal-area projections with compressional quadrants shaded. Where a solution reports only P
        and T axes, the double couple is reconstructed from those axes and labelled as such. Tensors
        can lag an origin by hours. The catalogue reaches back to 1900; before 1973 ComCat carries
        the ISC-GEM and Centennial compilations, so completeness varies by era, and the time chart
        marks the breaks at 1964, 1973 and 1976.
      </p>
      <p>
        <b>Plate boundaries.</b> Bird (2003), <i>An updated digital model of plate boundaries</i>,
        G³ 4(3), 1027 (PB2002), via the fraxen/tectonicplates repository; segment class and relative
        velocity from the PB2002 step file. Basemap: Natural Earth via world-atlas and us-atlas.
      </p>
      <p>
        <b>Quaternary faults.</b> West Coast view: USGS
        <a href="https://www.usgs.gov/programs/earthquake-hazards/faults"
          >Quaternary Fault and Fold Database of the United States</a
        >, traces with evidence of surface deformation in the past 1.6 million years, coloured by
        age of last movement as on the USGS fault map; pieces whose ends lie within 50 m are joined
        and bends under a pixel at full zoom are dropped.
      </p>
      <p>
        <b>Volcanoes.</b> Catalogue and eruption history from the Smithsonian Institution's
        <a href="https://volcano.si.edu/">Global Volcanism Program</a>, Volcanoes of the World
        database (non-commercial use, with thanks). Alert levels and aviation colour codes from the
        <a href="https://volcanoes.usgs.gov/">USGS Volcano Hazards Program</a> and
        <a href="https://www.geonet.org.nz/volcano">GeoNet</a>; each agency's scale is shown as
        published, they are not interchangeable. Weekly activity entries from the GVP/USGS Weekly
        Volcanic Activity Report when its feed is reachable.
      </p>
      <p class="byline">
        Built for Barbara by
        <a href="https://github.com/tillmanjr" rel="author noopener" target="_blank">Tillman</a>
      </p>
    </footer>
  </div>
  <DetailPanel />
  <VolcanoDetail v-if="hasVolcanoes(page)" />
  <MarksOverlay v-if="overlay !== null" />
  <Transition name="notice">
    <div v-if="notice.current.value !== null" class="notice" role="status">
      {{ notice.current.value }}
    </div>
  </Transition>
</template>
