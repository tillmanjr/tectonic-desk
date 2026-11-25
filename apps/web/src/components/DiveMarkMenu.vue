<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { vHint } from "../lib/hint.js";
import { useInjected } from "../lib/keys.js";
import { areaSlug, MANUAL, takenCount } from "../lib/manual.js";
import { TOUR, tourState, type TourId } from "../lib/tour.js";

/**
 * The ◆ itself, once `DiveMark` has found it is wanted: the deep dives about one part of the desk,
 * each with how far the reader got, and the way to its chapter of the Field manual. It fades once
 * every deep dive in its area is taken.
 */
const props = defineProps<{ area: string; dive?: TourId | undefined }>();
const tour = useInjected(TOUR);
const manual = useInjected(MANUAL);
const open = ref(false);
/** Whether the list opens rightwards, for a mark in the left half of the window. */
const rightward = ref(false);
function toggle(): void {
  const box = root.value?.getBoundingClientRect();
  rightward.value = box !== undefined && box.left < window.innerWidth / 2;
  open.value = !open.value;
}
const root = ref<HTMLElement | null>(null);

const dives = computed(() => tour.tours.filter((t) => t.deep?.area === props.area));
const taken = computed(() => takenCount(tour.progress.doc.value, dives.value));
const allTaken = computed(() => taken.value === dives.value.length);
const stateOf = (id: TourId) => tourState(tour.progress.doc.value, id);

function glyph(id: TourId): string {
  const s = stateOf(id);
  return s.kind === "done" ? "✓" : s.kind === "partway" ? "◐" : "○";
}
function note(id: TourId, steps: number): string {
  const s = stateOf(id);
  return s.kind === "partway" ? `${String(s.step + 1)} of ${String(steps)}` : String(steps);
}
function take(id: TourId): void {
  open.value = false;
  const s = stateOf(id);
  void tour.start(id, s.kind === "partway" ? s.step : 0);
}
function toChapter(): void {
  open.value = false;
  manual.show(areaSlug(props.area));
}
function onPointerDown(e: Event): void {
  if (e.target instanceof Node && root.value?.contains(e.target) === true) return;
  open.value = false;
}
function onKey(e: KeyboardEvent): void {
  e.stopPropagation();
  if (e.key === "Escape") open.value = false;
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
  <span ref="root" class="divemark" :class="{ taken: allTaken }" @click.stop @keydown="onKey">
    <button
      v-hint="`Deep dives on ${area}: ${String(taken)} of ${String(dives.length)} taken`"
      type="button"
      class="divebtn"
      :aria-label="`Deep dives on ${area}`"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1l6 6-6 6-6-6z" /></svg>
    </button>
    <span
      v-if="open"
      class="divepop"
      :class="{ rightward }"
      role="group"
      :aria-label="`Deep dives on ${area}`"
    >
      <span class="divehead"
        ><span class="tourkind deep">Deep dives</span><b>{{ area }}</b
        ><span class="divecount">{{ taken }} of {{ dives.length }}</span></span
      >
      <button
        v-for="t in dives"
        :key="t.id"
        type="button"
        class="diverow"
        :class="{ here: t.id === dive }"
        @click="take(t.id)"
      >
        <span class="diveglyph" aria-hidden="true">{{ glyph(t.id) }}</span
        >{{ t.title }}<span class="divesteps">{{ note(t.id, t.steps.length) }}</span>
      </button>
      <span class="divefoot">
        <button type="button" class="divechapter" @click="toChapter">
          {{ area }} in the Field manual
        </button>
      </span>
    </span>
  </span>
</template>
