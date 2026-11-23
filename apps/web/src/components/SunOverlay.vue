<script setup lang="ts">
import {
  HELIOVIEWER_CREDIT,
  SUN_CREDIT,
  SUN_FRAMES,
  sunFrame,
  type SunKey,
} from "@tectonic/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { fmtStamp } from "../lib/format.js";
import { vHint } from "../lib/hint.js";
import { API, CLOCK, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { stepKey } from "../lib/sun-frames.js";
import {
  coveredByLatest,
  movieSpan,
  useGeneratedMovie,
  type MovieSpan,
} from "../lib/sun-generate.js";
import { movieNote, SUN_MOVIES, type MovieSize } from "../lib/sun-movies.js";

/**
 * One Sun channel large over the page: its animation (the agency's latest movie, 512 px unless
 * the reader asks for 1024), a movie generated for the page's window when the latest one does not
 * cover it, or the latest 1024 px still; what it shows, which time it covers and its credit, and a
 * filmstrip of the seven. Escape, the × or a click on the backdrop close it; ← → step. The
 * animation and size choices hold while the reader steps between channels; a generated movie
 * belongs to its channel and is dropped on a step.
 */
const props = defineProps<{ open: SunKey | null }>();
const emit = defineEmits<{ "update:open": [key: SunKey | null] }>();
const api = useInjected(API);
const store = useInjected(SPACE);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);

const timeOf = (key: SunKey): string | null =>
  store.sun.value?.frames.find((f) => f.key === key)?.time ?? null;

/** The agency's movie, a generated one, or the still; and the movie size. */
const mode = ref<"movie" | "generated" | "still">("movie");
const size = ref<MovieSize>(512);
/** Where the movie shown stands in the browser. */
const movieState = ref<"loading" | "ready" | "error">("loading");
const gen = useGeneratedMovie(api);
/** The Cancel/Continue step before a movie is generated. */
const confirming = ref(false);

const GENERATE_HINT =
  "The agencies' ready-made movies cover only the last 48 hours (SDO) or about 4 days (LASCO). Generate asks Helioviewer.org to build this channel's movie for the page's window instead: up to 300 frames spread across it, at most its last 30 days, from images since 2010 (SDO) or 1997 (SOHO). Building takes from a few seconds to several minutes; a movie once built is kept for six hours, so asking again for the same window is quick.";

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
    /** The span a generated movie would cover, offered only where the latest movie does not reach. */
    span: coveredByLatest(SUN_MOVIES[f.key], store.range.value, clock.now.value)
      ? null
      : movieSpan(f.key, store.range.value, clock.now.value),
  };
});

const spanText = (from: Date | string, to: Date | string): string => {
  const f = typeof from === "string" ? from : from.toISOString();
  const t = typeof to === "string" ? to : to.toISOString();
  return `${fmtStamp(f, zone.value, { label: false })} to ${fmtStamp(t, zone.value)}`;
};

/** What plays, when anything does: the source and the caption's line on its time. */
const video = computed(() => {
  const key = props.open;
  if (key === null) return null;
  if (mode.value === "movie") {
    const m = SUN_MOVIES[key];
    return { src: m.src[size.value], note: movieNote(m, store.range.value, zone.value) };
  }
  const g = gen.movie.value;
  if (mode.value !== "generated" || g === null) return null;
  const { url } = g;
  if (url === null) return null;
  return {
    src: url,
    note: `Generated for ${spanText(g.from, g.to)} at ${String(g.size)} px.`,
  };
});
const playing = computed(() => video.value !== null && movieState.value !== "error");
watch(
  () => video.value?.src,
  () => {
    movieState.value = "loading";
  },
);

function askGenerate(): void {
  confirming.value = true;
}
function generate(key: SunKey, s: MovieSpan): void {
  confirming.value = false;
  mode.value = "generated";
  gen.start(key, s, size.value);
}
function stopWaiting(): void {
  gen.stop();
  mode.value = "movie";
}

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
  if (ev.key === "Escape" && confirming.value) confirming.value = false;
  else if (ev.key === "Escape") close();
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
    confirming.value = false;
    if (mode.value === "generated") stopWaiting();
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
        v-if="playing && video !== null"
        :key="video.src"
        class="sunlarge"
        :src="video.src"
        :poster="current.src"
        :aria-label="`${current.title}, animation. ${video.note}`"
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
      <div
        v-if="confirming && current.span !== null"
        class="sunconfirm"
        role="alertdialog"
        aria-label="Generate an animation"
      >
        <p>
          Generate a {{ size }} px animation of {{ current.title }} for
          {{ spanText(current.span.from, current.span.to) }}?
        </p>
        <p v-if="current.span.clipped" class="muted">
          The page's window is longer than 30 days, so this covers its last 30 days.
        </p>
        <p v-if="current.span.trimmed" class="muted">
          Images for this channel begin
          {{ spanText(current.span.from, current.span.to).slice(0, 10) }}, so it starts there.
        </p>
        <p><b>This may take from a few seconds to several minutes.</b></p>
        <div class="sunconfirmrow">
          <button type="button" @click="confirming = false">Cancel</button>
          <button type="button" class="go" @click="generate(current.key, current.span)">
            Continue
          </button>
        </div>
      </div>
      <div class="sunmodes" role="group" aria-label="Animation or still">
        <button type="button" :aria-pressed="mode === 'movie'" @click="mode = 'movie'">
          Animation
        </button>
        <button
          v-if="gen.state.value !== 'idle'"
          type="button"
          :aria-pressed="mode === 'generated'"
          @click="mode = 'generated'"
        >
          Generated
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
        <template v-if="current.span !== null && mode !== 'generated'">
          <button type="button" class="sungen" @click="askGenerate">
            Generate animation for this window
          </button>
          <span
            v-hint="GENERATE_HINT"
            class="finfo"
            role="img"
            aria-label="About generated animations"
            >i</span
          >
        </template>
        <span class="sunstate" role="status"
          ><template v-if="mode === 'generated' && gen.state.value === 'building'"
            ><span class="spin" aria-hidden="true"></span>Building the animation…{{
              gen.progress.value === null ? "" : ` ${String(gen.progress.value)}%`
            }}
            <button type="button" class="sunstop" @click="stopWaiting">
              Stop waiting
            </button></template
          ><template v-else-if="mode === 'generated' && gen.state.value === 'error'"
            >The animation could not be built: {{ gen.error.value }}</template
          ><template v-else-if="video !== null && movieState === 'loading'"
            ><span class="spin" aria-hidden="true"></span>Loading animation…</template
          ><template v-else-if="video !== null && movieState === 'error'"
            >Animation unavailable; showing the latest still.</template
          ></span
        >
      </div>
      <p class="suncap">
        <b>{{ current.title }}</b> · {{ current.note }}
      </p>
      <p v-if="playing && video !== null" class="suncap span">{{ video.note }}</p>
      <p class="suncap muted">
        <template v-if="!playing">{{ current.stamp }} · </template>{{ current.credit
        }}<template v-if="playing && mode === 'generated'"> · {{ HELIOVIEWER_CREDIT }}</template>
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
