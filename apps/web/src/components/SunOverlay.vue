<script setup lang="ts">
import { SUN_CREDIT, SUN_FRAMES, sunFrame, type SunKey } from "@tectonic/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { fmtStamp } from "../lib/format.js";
import { API, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { stepKey } from "../lib/sun-frames.js";
import { movieNote, SUN_MOVIES, type MovieSize } from "../lib/sun-movies.js";

/**
 * One Sun channel large over the page: its animation (the agency's latest movie, 512 px unless
 * the reader asks for 1024) or the latest 1024 px still, what it shows, which time it covers and
 * its credit, and a filmstrip of the seven. Escape, the × or a click on the backdrop close it;
 * ← → step. The animation and size choices hold while the reader steps between channels.
 */
const props = defineProps<{ open: SunKey | null }>();
const emit = defineEmits<{ "update:open": [key: SunKey | null] }>();
const api = useInjected(API);
const store = useInjected(SPACE);
const zone = useInjected(ZONE);

const timeOf = (key: SunKey): string | null =>
  store.sun.value?.frames.find((f) => f.key === key)?.time ?? null;

/** Animation or still, and the animation's size; kept across channels and openings. */
const mode = ref<"movie" | "still">("movie");
const size = ref<MovieSize>(512);
/** Where the movie for the channel and size shown stands. */
const movieState = ref<"loading" | "ready" | "error">("loading");

const current = computed(() => {
  if (props.open === null) return null;
  const f = sunFrame(props.open);
  const time = timeOf(f.key);
  return {
    key: f.key,
    title: f.title,
    note: f.note,
    src: api.sunImageUrl(f.key, 1024, time),
    stamp: time === null ? "time unknown" : fmtStamp(time, zone.value),
    credit: SUN_CREDIT[f.source],
  };
});

const movie = computed(() => {
  if (props.open === null) return null;
  const m = SUN_MOVIES[props.open];
  return { src: m.src[size.value], note: movieNote(m, store.range.value, zone.value) };
});
/** The movie plays unless the reader chose the still or it failed to load. */
const playing = computed(() => mode.value === "movie" && movieState.value !== "error");
watch(
  () => movie.value?.src,
  () => {
    movieState.value = "loading";
  },
);

const strip = computed(() =>
  SUN_FRAMES.map((f) => ({
    key: f.key,
    title: f.title,
    src: api.sunImageUrl(f.key, 512, timeOf(f.key)),
  })),
);

function close(): void {
  emit("update:open", null);
}

/** The frame last shown, which the keys step from after the prop has moved on. */
let shown: SunKey = "aia193";

function step(delta: number): void {
  emit("update:open", stepKey(shown, delta));
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape") close();
  else if (ev.key === "ArrowLeft") step(-1);
  else if (ev.key === "ArrowRight") step(1);
  else return;
  ev.preventDefault();
}

const closeEl = ref<HTMLButtonElement | null>(null);
let held = false;

function acquire(): void {
  held = true;
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKey);
  void nextTick(() => closeEl.value?.focus());
}
function release(): void {
  held = false;
  document.body.style.overflow = "";
  window.removeEventListener("keydown", onKey);
}

watch(
  () => props.open,
  (open) => {
    if (open !== null) {
      shown = open;
      if (!held) acquire();
    } else if (held) {
      release();
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  if (held) release();
});
</script>

<template>
  <div v-if="current !== null" class="sunoverlay" @click.self="close">
    <div class="sunbox" role="dialog" aria-modal="true" :aria-label="current.title">
      <button ref="closeEl" type="button" class="sunclose" aria-label="Close" @click="close">
        ×
      </button>
      <button type="button" class="sunarrow prev" aria-label="Previous frame" @click="step(-1)">
        ‹
      </button>
      <video
        v-if="playing && movie !== null"
        :key="movie.src"
        class="sunlarge"
        :src="movie.src"
        :poster="current.src"
        :aria-label="`${current.title}, animation of ${movie.note}`"
        width="1024"
        height="1024"
        autoplay
        muted
        loop
        playsinline
        controls
        preload="auto"
        @loadeddata="movieState = 'ready'"
        @error="movieState = 'error'"
      ></video>
      <img
        v-else
        class="sunlarge"
        :src="current.src"
        :alt="`${current.title}, ${current.stamp}`"
        width="1024"
        height="1024"
      />
      <button type="button" class="sunarrow next" aria-label="Next frame" @click="step(1)">
        ›
      </button>
      <div class="sunmodes" role="group" aria-label="Animation or still">
        <button type="button" :aria-pressed="mode === 'movie'" @click="mode = 'movie'">
          Animation
        </button>
        <button type="button" :aria-pressed="mode === 'still'" @click="mode = 'still'">
          Still
        </button>
        <button
          v-if="mode === 'movie'"
          type="button"
          class="sunsize"
          @click="size = size === 512 ? 1024 : 512"
        >
          {{
            size === 512
              ? "Higher resolution (1024 px, a larger download)"
              : "Lower resolution (512 px)"
          }}
        </button>
        <span class="sunstate" role="status"
          ><template v-if="mode === 'movie' && movieState === 'loading'"
            ><span class="spin" aria-hidden="true"></span>Loading animation…</template
          ><template v-else-if="mode === 'movie' && movieState === 'error'"
            >Animation unavailable; showing the latest still.</template
          ></span
        >
      </div>
      <p class="suncap">
        <b>{{ current.title }}</b> · {{ current.note }}
      </p>
      <p v-if="playing && movie !== null" class="suncap span">{{ movie.note }}</p>
      <p class="suncap muted">
        <template v-if="!playing">{{ current.stamp }} · </template>{{ current.credit }}
      </p>
      <div class="sunfilm">
        <button
          v-for="f in strip"
          :key="f.key"
          type="button"
          class="sunfilmthumb"
          :class="{ on: f.key === current.key }"
          :aria-pressed="f.key === current.key"
          :title="f.title"
          @click="emit('update:open', f.key)"
        >
          <img :src="f.src" :alt="f.title" />
        </button>
      </div>
    </div>
  </div>
</template>
