<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useInjected } from "../lib/keys.js";
import { TOUR } from "../lib/tour.js";

/**
 * Once a tour taken from the Field manual ends, with the reader's view given back: back to the
 * manual (Enter, the default) or stay in the view (Escape).
 */
const tour = useInjected(TOUR);
const back = ref<HTMLButtonElement | null>(null);

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    tour.stay();
  } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    void tour.goBack();
  }
}
watch(
  () => tour.returning.value !== null,
  async (on) => {
    if (on) {
      document.addEventListener("keydown", onKey);
      await nextTick();
      back.value?.focus();
    } else document.removeEventListener("keydown", onKey);
  },
  { immediate: true },
);
onUnmounted(() => {
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div
    v-if="tour.returning.value !== null"
    class="tourreturn"
    role="dialog"
    aria-label="Tour ended"
  >
    <span>Your view is back as you left it.</span>
    <button ref="back" type="button" class="tourbtn primary" @click="tour.goBack()">
      Back to the Field manual <kbd>Enter</kbd>
    </button>
    <button type="button" class="tourbtn" @click="tour.stay()">Stay here <kbd>Esc</kbd></button>
  </div>
</template>
