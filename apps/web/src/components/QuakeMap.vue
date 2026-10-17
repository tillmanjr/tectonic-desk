<script setup lang="ts">
import type { ApiEvent } from "@tectonic/shared";
import { computed, onUnmounted, ref, watch } from "vue";
import MapEvents from "./MapEvents.vue";
import MapShell from "./MapShell.vue";
import { createAnimation, DAY_MS } from "../lib/animation.js";
import { fmtMag, fmtShort, fmtStamp, placeOf } from "../lib/format.js";
import { API, CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { useMapView } from "../lib/mapview.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });

const api = useInjected(API);
const catalog = useInjected(CATALOG);
const { filtered: events, selectedId, selected } = catalog;
const select = useInjected(SELECT);
const zone = useInjected(ZONE);
const clock = useInjected(CLOCK);

const mv = useMapView({
  api,
  region: () => catalog.requireRegion(),
  animate: () => props.animate,
});
const showMech = ref(true);

const anim = createAnimation();
/** The loaded window, never reaching past now: the date range, else the preset's trailing days. */
const windowBounds = computed(() => {
  const now = clock.now.value;
  const win = catalog.range.value;
  if (win !== null) {
    const end = new Date(Math.min(Date.parse(win.until), now.getTime()));
    return { start: new Date(win.since), end };
  }
  return { start: new Date(now.getTime() - catalog.requireRegion().days * DAY_MS), end: now };
});
/** The overlay line: how many of the window's events the refinements leave on the map. */
const countLine = computed(
  () =>
    `Showing ${String(events.value.length)} of ${String(catalog.windowEvents.value.length)} events`,
);
/** What the map draws: everything, or only what has happened by the animation cursor. */
const shown = computed(() => {
  const c = anim.cursor.value;
  if (c === null) return events.value;
  const t = c.getTime();
  return events.value.filter((e) => Date.parse(e.time) <= t);
});
function openAnimation(): void {
  anim.open(windowBounds.value.start, windowBounds.value.end, zone.value);
}
function togglePlay(): void {
  if (anim.playing.value) anim.pause();
  else anim.play();
}
onUnmounted(() => {
  anim.close();
});

function onHover(payload: { e: ApiEvent; x: number; y: number }): void {
  const { e } = payload;
  const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
  const type = e.magType === null ? "" : ` ${e.magType}`;
  mv.showTip(
    `M${fmtMag(e.mag)}${type} · ${depth} km · ${placeOf(e)} · ${fmtShort(e.time, zone.value)}`,
    payload.x,
    payload.y,
  );
}

watch(selected, (e) => {
  if (e !== null) mv.zoomTo(e.longitude, e.latitude);
});
</script>

<template>
  <MapShell :mv="mv" label="Map of earthquake epicenters" :count-line="countLine">
    <template #tools>
      <label><input v-model="showMech" type="checkbox" /> Focal mechanisms</label>
    </template>
    <template #actions>
      <button
        type="button"
        class="zbtn"
        style="width: auto; padding: 0 8px"
        :aria-pressed="anim.active.value"
        title="Replay the loaded window on the map, day by day"
        @click="anim.active.value ? anim.close() : openAnimation()"
      >
        Animate
      </button>
    </template>
    <template #bar>
      <div v-if="anim.active.value && anim.cursor.value !== null" class="animbar">
        <label
          >Seconds per day
          <input v-model.number="anim.secondsPerDay.value" type="number" min="0.1" step="0.5" />
        </label>
        <button type="button" class="zbtn" aria-label="Back one day" @click="anim.stepDay(-1)">
          ◀
        </button>
        <button
          type="button"
          class="zbtn play"
          :aria-label="anim.playing.value ? 'Pause' : 'Start'"
          @click="togglePlay"
        >
          {{ anim.playing.value ? "Pause" : "Start" }}
        </button>
        <button type="button" class="zbtn" aria-label="Forward one day" @click="anim.stepDay(1)">
          ▶
        </button>
        <span class="animclock num">{{ fmtStamp(anim.cursor.value.toISOString(), zone) }}</span>
        <span class="animcount">{{ shown.length }} of {{ events.length }} events</span>
        <span class="sp"></span>
        <button
          type="button"
          class="zbtn"
          style="width: auto; padding: 0 8px"
          @click="anim.close()"
        >
          Close
        </button>
      </div>
    </template>
    <template #layers="{ frame, k, minRadius }">
      <MapEvents
        :frame="frame"
        :events="shown"
        :k="k"
        :selected-id="selectedId"
        :show-mech="showMech"
        :min-mag="mv.view.value.minMag"
        :min-radius="minRadius"
        @select="select"
        @hover="onHover"
        @leave="mv.clearTip()"
      />
    </template>
  </MapShell>
</template>
