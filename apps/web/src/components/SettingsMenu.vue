<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import ThemeToggle from "./ThemeToggle.vue";
import type { Zone } from "../lib/format.js";

/** The header's settings menu: the time zone and the theme, behind one button. */
defineProps<{ zone: Zone }>();
const emit = defineEmits<{ toggleZone: [] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

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
  <div ref="root" class="settings" @keydown="onKey">
    <button
      type="button"
      class="settings-btn"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-controls="settings-menu"
      aria-label="Settings"
      title="Settings: time zone and theme"
      @click="open = !open"
    >
      ⚙
    </button>
    <div v-if="open" id="settings-menu" class="settings-menu" aria-label="Settings">
      <div class="srow">
        <span class="slabel">Times</span>
        <button
          type="button"
          class="theme-btn fixed"
          title="Show every date and time in UTC or in your browser's zone"
          @click="emit('toggleZone')"
        >
          {{ zone === "utc" ? "UTC" : "local" }}
        </button>
      </div>
      <div class="srow">
        <span class="slabel">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  </div>
</template>
