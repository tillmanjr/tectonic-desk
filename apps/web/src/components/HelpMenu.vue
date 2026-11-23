<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useInjected } from "../lib/keys.js";
import { TOUR, tourState, type TourId, type TourState } from "../lib/tour.js";

/** The header's Help menu: the quick tours, each with its progress, and every step to start at. */
const tour = useInjected(TOUR);
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function stateText(s: TourState, steps: number): string {
  if (s.kind === "new") return "Not started";
  if (s.kind === "done") return "Done";
  return `Step ${String(s.step + 1)} of ${String(steps)}`;
}
function primaryText(s: TourState): string {
  if (s.kind === "new") return "Start";
  return s.kind === "done" ? "Take again" : "Resume";
}
function begin(id: TourId, step: number): void {
  open.value = false;
  void tour.start(id, step);
}
/** Starts a tour where the reader left it, or from the top. */
function resume(id: TourId): void {
  const s = tourState(tour.progress.doc.value, id);
  begin(id, s.kind === "partway" ? s.step : 0);
}
function onPointerDown(e: Event): void {
  if (e.target instanceof Node && root.value?.contains(e.target) === true) return;
  open.value = false;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    open.value = false;
  }
}
watch(open, (on) => {
  if (on) document.addEventListener("pointerdown", onPointerDown);
  else document.removeEventListener("pointerdown", onPointerDown);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onPointerDown);
});
</script>

<template>
  <div ref="root" class="help" data-tour="help" @keydown="onKey">
    <button
      type="button"
      class="help-btn"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-controls="help-menu"
      aria-label="Help"
      title="Help: quick tours of the app"
      @click="open = !open"
    >
      ?
    </button>
    <div v-if="open" id="help-menu" class="settings-menu helpmenu" aria-label="Help">
      <p class="hhead">Quick tours</p>
      <button
        v-if="tour.resumable.value !== null"
        type="button"
        class="hresume"
        @click="begin(tour.resumable.value.tour.id, tour.resumable.value.step)"
      >
        Resume {{ tour.resumable.value.tour.title }} at step
        {{ tour.resumable.value.step + 1 }}
      </button>
      <div v-for="t in tour.tours" :key="t.id" class="htour">
        <div class="htitle">
          <b>{{ t.title }}</b>
          <span class="hstate">{{
            stateText(tourState(tour.progress.doc.value, t.id), t.steps.length)
          }}</span>
        </div>
        <p class="hblurb">{{ t.blurb }}</p>
        <div class="hacts">
          <button type="button" class="tourbtn primary" @click="resume(t.id)">
            {{ primaryText(tourState(tour.progress.doc.value, t.id)) }}
          </button>
          <button
            v-if="tourState(tour.progress.doc.value, t.id).kind === 'partway'"
            type="button"
            class="tourbtn"
            @click="begin(t.id, 0)"
          >
            Restart
          </button>
        </div>
        <details class="hsteps">
          <summary>Steps</summary>
          <ol>
            <li v-for="(s, i) in t.steps" :key="s.id">
              <button type="button" @click="begin(t.id, i)">{{ s.title }}</button>
            </li>
          </ol>
        </details>
      </div>
    </div>
  </div>
</template>
