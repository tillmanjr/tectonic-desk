<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useInjected } from "../lib/keys.js";
import { TOUR } from "../lib/tour.js";
import {
  dockOf,
  inView,
  SPOT_PAD,
  targetElements,
  TRACK_MS,
  unionBox,
  type Box,
} from "../lib/tour-target.js";

/**
 * The running tour: a spotlight on the step's targets (a cut-out in a dimmed window that never
 * takes the pointer, so the app stays usable) and the step card, docked at the top or bottom of
 * the window away from the targets.
 */

/** Lookups without a target before the card says the step's part is not on screen. */
const MISS_AFTER = 3;

const tour = useInjected(TOUR);
const active = tour.active;
const box = ref<Box | null>(null);
const misses = ref(0);
const next = ref<HTMLButtonElement | null>(null);
let scrolled = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** The step on show; a new one (even the same step restarted) resets the lookups. */
const stepKey = computed(() => {
  const a = active.value;
  return a === null ? null : { targets: a.step.targets };
});
let targets: readonly string[] = [];
const dock = computed(() => dockOf(box.value, window.innerHeight));
const missing = computed(
  () =>
    active.value !== null &&
    active.value.step.targets.length > 0 &&
    box.value === null &&
    misses.value >= MISS_AFTER,
);
const spot = computed(() => {
  const b = box.value;
  if (b === null) return null;
  return {
    left: `${String(b.left - SPOT_PAD)}px`,
    top: `${String(b.top - SPOT_PAD)}px`,
    width: `${String(b.right - b.left + 2 * SPOT_PAD)}px`,
    height: `${String(b.bottom - b.top + 2 * SPOT_PAD)}px`,
  };
});

function track(): void {
  const els = targetElements(targets);
  const b = unionBox(els);
  box.value = b;
  if (b === null) {
    misses.value++;
    return;
  }
  if (scrolled) return;
  scrolled = true;
  const first = els[0];
  if (first !== undefined && !inView(b, window.innerWidth, window.innerHeight)) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "Escape") {
    void tour.exit();
    return;
  }
  const t = e.target;
  if (t instanceof HTMLElement && t.closest("input, select, textarea, [contenteditable]") !== null)
    return;
  if (e.key === "ArrowRight") void tour.next();
  else if (e.key === "ArrowLeft") void tour.back();
}

function stop(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  document.removeEventListener("keydown", onKey);
}

watch(stepKey, (step, was) => {
  scrolled = false;
  misses.value = 0;
  box.value = null;
  if (step === null) {
    stop();
    return;
  }
  targets = step.targets;
  void nextTick(track);
  if (was === null) {
    timer = setInterval(track, TRACK_MS);
    document.addEventListener("keydown", onKey);
    void nextTick(() => next.value?.focus());
  }
});
onUnmounted(stop);
</script>

<template>
  <div v-if="active !== null" class="tour">
    <div v-if="spot !== null" class="tourspot" :style="spot" aria-hidden="true"></div>
    <div v-else class="tourdim" aria-hidden="true"></div>
    <section
      class="tourcard"
      :class="dock"
      role="dialog"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
    >
      <header class="tourhead">
        <span class="tourpath"
          >{{ active.tour.title }} · {{ active.index + 1 }} of {{ active.tour.steps.length }}</span
        >
        <button type="button" class="tourexit" @click="tour.exit()">Exit tour</button>
      </header>
      <h2 id="tour-title" aria-live="polite">{{ active.step.title }}</h2>
      <p id="tour-body">{{ active.step.body }}</p>
      <p v-if="active.step.tryIt !== undefined" class="tourtry">
        <b>Try it.</b> {{ active.step.tryIt }}
      </p>
      <p v-if="missing" class="tourmiss">This part is not on screen right now.</p>
      <footer class="tourfoot">
        <div class="tourdots">
          <button
            v-for="(s, i) in active.tour.steps"
            :key="s.id"
            type="button"
            class="tourdot"
            :aria-label="`Step ${String(i + 1)}: ${s.title}`"
            :aria-current="i === active.index ? 'step' : undefined"
            @click="tour.goTo(i)"
          ></button>
        </div>
        <button type="button" class="tourbtn" :disabled="active.index === 0" @click="tour.back()">
          Back
        </button>
        <button ref="next" type="button" class="tourbtn primary" @click="tour.next()">
          {{ active.index === active.tour.steps.length - 1 ? "Done" : "Next" }}
        </button>
      </footer>
    </section>
  </div>
</template>
