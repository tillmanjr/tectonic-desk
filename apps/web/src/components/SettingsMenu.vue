<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import ThemeToggle from "./ThemeToggle.vue";
import type { Zone } from "../lib/format.js";
import { vHint } from "../lib/hint.js";
import { SETTINGS, useInjected } from "../lib/keys.js";

/**
 * The header's settings menu: the time zone, the theme, the panel's beachball and the ◆ deep dive
 * marks, behind one button. The menu stays in the page while closed (v-show) so a tour can flip
 * its switches by name and give them back at the end.
 */
defineProps<{ zone: Zone }>();
const emit = defineEmits<{ toggleZone: [] }>();
const open = ref(false);
const settings = useInjected(SETTINGS);
const diveMarks = computed(() => settings.current.value.diveMarks);
function toggleDiveMarks(): void {
  settings.set({ ...settings.current.value, diveMarks: !diveMarks.value });
}
const bowl = computed(() => settings.current.value.beachball === "bowl");
function toggleBeachball(): void {
  settings.set({ ...settings.current.value, beachball: bowl.value ? "flat" : "bowl" });
}
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
  <div ref="root" class="settings" data-tour="settings" @keydown="onKey">
    <button
      v-hint="'Settings: time zone, theme, beachball and deep dive marks'"
      type="button"
      class="settings-btn"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-controls="settings-menu"
      aria-label="Settings"
      @click="open = !open"
    >
      ⚙
    </button>
    <div
      v-show="open"
      id="settings-menu"
      class="settings-menu"
      data-tour="settings"
      aria-label="Settings"
    >
      <div class="srow">
        <span class="slabel">Times</span>
        <button
          v-hint="'Show every date and time in UTC or in your browser\'s zone'"
          type="button"
          class="theme-btn fixed"
          @click="emit('toggleZone')"
        >
          {{ zone === "utc" ? "UTC" : "local" }}
        </button>
      </div>
      <div class="srow">
        <span class="slabel">Theme</span>
        <ThemeToggle />
      </div>
      <div class="srow">
        <span class="slabel">Beachball</span>
        <button
          v-hint="
            'Draws the event panel\'s beachball flat, or as the inside of the focal sphere: a bowl that opens tilted, settles to the equal-area plot and tilts again with a slider'
          "
          type="button"
          class="theme-btn fixed"
          data-tour="settings.beachball"
          :aria-pressed="bowl"
          @click="toggleBeachball"
        >
          {{ bowl ? "Bowl" : "Flat" }}
        </button>
      </div>
      <div class="srow">
        <span class="slabel">Deep dive marks</span>
        <button
          v-hint="'Shows or hides the ◆ on each part of the desk that lists its deep dives'"
          type="button"
          class="theme-btn fixed"
          data-tour="settings.marks"
          :aria-pressed="diveMarks"
          @click="toggleDiveMarks"
        >
          {{ diveMarks ? "On" : "Off" }}
        </button>
      </div>
    </div>
  </div>
</template>
