<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useInjected } from "../lib/keys.js";
import { OFFER_DELAY_MS, TOUR } from "../lib/tour.js";

/**
 * The first visit's offer of the orientation tour: one line in the notice position, shown once
 * the page has settled. Taking the tour, the ×, or any other action (a press elsewhere, a key, a
 * scroll, a route change) dismisses it for good. Tab and the modifier keys do not, so the
 * button can be reached from the keyboard.
 */
const props = defineProps<{
  /** Whether this visit may show the offer: a plain visit, not a shared link. */
  eligible: boolean;
  /** The route as it stands; a change dismisses the offer. */
  location: string;
}>();
const tour = useInjected(TOUR);
const shown = ref(false);
const take = ref<HTMLButtonElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

const PASSIVE_KEYS = ["Tab", "Shift", "Control", "Alt", "Meta"];

function onPointer(e: Event): void {
  if (e.target instanceof Node && take.value?.contains(e.target) === true) return;
  dismiss();
}
function onKey(e: KeyboardEvent): void {
  if (PASSIVE_KEYS.includes(e.key)) return;
  if ((e.key === "Enter" || e.key === " ") && e.target === take.value) return;
  dismiss();
}
function listen(on: boolean): void {
  if (on) {
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("wheel", dismiss, true);
    document.addEventListener("touchmove", dismiss, true);
  } else {
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("wheel", dismiss, true);
    document.removeEventListener("touchmove", dismiss, true);
  }
}
function hide(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (shown.value) listen(false);
  shown.value = false;
}
function dismiss(): void {
  hide();
  tour.progress.dismissOffer();
}
function start(): void {
  hide();
  void tour.start("orientation");
}

onMounted(() => {
  if (!props.eligible || tour.progress.doc.value.offerDismissed) return;
  timer = setTimeout(() => {
    timer = null;
    shown.value = true;
    listen(true);
  }, OFFER_DELAY_MS);
});
watch(
  () => props.location,
  () => {
    if (shown.value) dismiss();
  },
);
// Taking a tour from the Help menu dismisses the offer too.
watch(() => tour.progress.doc.value.offerDismissed, hide);
onUnmounted(hide);
</script>

<template>
  <div v-if="shown" class="notice touroffer" role="status">
    <span>New here?</span>
    <button ref="take" type="button" class="tourbtn primary" @click="start">Take the tour</button>
    <button type="button" class="touroffx" aria-label="Not now">×</button>
  </div>
</template>
