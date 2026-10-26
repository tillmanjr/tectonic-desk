<script setup lang="ts">
import { AURORA_THRESHOLDS } from "@tectonic/shared";
import { computed, onMounted, ref, shallowRef } from "vue";
import AuroraMap from "./AuroraMap.vue";
import { loadWorldBasemap } from "../lib/basemap-cache.js";
import { fmtClock, fmtStamp } from "../lib/format.js";
import type { Basemap } from "../lib/geo.js";
import { AURORA, useInjected, ZONE } from "../lib/keys.js";

/**
 * The aurora oval now and over the last three days: north and south polar maps of OVATION
 * Prime's probability bands, the frame's times and hemispheric power, and a scrub through the
 * stored frames.
 */
const store = useInjected(AURORA);
const zone = useInjected(ZONE);

const basemap = shallowRef<Basemap | null>(null);
onMounted(() => {
  loadWorldBasemap()
    .then((b) => {
      basemap.value = b;
    })
    .catch((e: unknown) => {
      console.error("basemap failed to load", e);
    });
});

const frame = computed(() => store.frame.value);
const land = computed(() => {
  const b = basemap.value;
  return b === null ? null : b.land;
});
const following = computed(() => store.selected.value === null);
const last = computed(() => store.frames.value.length - 1);
/** The slider's position: the frame on show, by index into the list. */
const index = computed(() =>
  store.frames.value.findIndex((f) => f.observed === frame.value?.observed),
);

const slider = ref<HTMLInputElement | null>(null);
/** Moves to the frame under the slider; the newest frame means following again. */
function scrub(): void {
  const i = Number(slider.value?.value);
  const picked = store.frames.value[i];
  store.select(i >= last.value || picked === undefined ? null : picked.observed);
}

const power = (gw: number | null): string =>
  gw === null ? "—" : `${String(Number(gw.toFixed(1)))} GW`;
</script>

<template>
  <section class="panel aurora">
    <h2>Aurora oval<span>OVATION Prime</span></h2>
    <p v-if="frame === null && store.error.value !== null" class="cap bad">
      {{ store.error.value }}
    </p>
    <p v-if="frame === null" class="cap note">No aurora frames yet.</p>
    <div v-else class="auroragrid">
      <AuroraMap
        hemisphere="north"
        :bands="store.bands.value"
        :forecast="frame.forecast"
        :land="land"
      />
      <AuroraMap
        hemisphere="south"
        :bands="store.bands.value"
        :forecast="frame.forecast"
        :land="land"
      />
      <div class="aurorainfo">
        <p v-if="store.error.value !== null" class="cap bad">{{ store.error.value }}</p>
        <p class="times">
          Observed {{ fmtClock(frame.observed, zone) }} · forecast for
          {{ fmtClock(frame.forecast, zone) }}
        </p>
        <p class="power">
          Hemispheric power N {{ power(frame.powerNorth) }} · S {{ power(frame.powerSouth) }}
        </p>
        <ul class="aulegend" aria-label="chance of aurora">
          <li v-for="t in AURORA_THRESHOLDS" :key="t">
            <i :class="`au-${String(t)}`"></i>{{ t }}%
          </li>
          <li class="cap">chance of aurora</li>
        </ul>
        <div class="scrub">
          <input
            ref="slider"
            type="range"
            min="0"
            :max="last"
            :value="index"
            :aria-label="`Frame observed ${fmtStamp(frame.observed, zone, { date: 'monthday' })}`"
            @input="scrub"
          />
          <span class="cap">{{ fmtStamp(frame.observed, zone, { date: "monthday" }) }}</span>
          <button
            type="button"
            :disabled="last < 1"
            :aria-pressed="store.playing.value"
            @click="store.playing.value ? store.pause() : store.play()"
          >
            {{ store.playing.value ? "Pause" : "Play" }}
          </button>
          <button type="button" :disabled="following" @click="store.select(null)">Latest</button>
        </div>
        <p class="cap">
          OVATION Prime (SWPC): the probability of aurora over a point at the forecast time, 30 to
          90 minutes after the solar wind observation at L1. Noon is at the top of each map and the
          night side is shaded; the scrub runs over the last three days of frames, and Play steps
          through them half an hour at a time.
        </p>
      </div>
    </div>
  </section>
</template>
