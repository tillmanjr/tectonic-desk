<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import ThemeToggle from "./ThemeToggle.vue";
import type { Zone } from "../lib/format.js";
import type { GlossaryOpen } from "../lib/glossary.js";
import { vHint } from "../lib/hint.js";
import { SETTINGS, useInjected } from "../lib/keys.js";

/**
 * The header's settings menu: the time zone, the theme, the panel's beachball, the ◆ deep dive
 * marks and the glossary's underlines and trigger, behind one button. The menu stays in the page while closed (v-show) so a tour can flip
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
const underlines = computed(() => settings.current.value.glossaryUnderlines);
function toggleUnderlines(): void {
  settings.set({ ...settings.current.value, glossaryUnderlines: !underlines.value });
}
const OPENS: readonly { id: GlossaryOpen; label: string; hint: string }[] = [
  { id: "dblclick", label: "Double click", hint: "A double click on a term opens its entry" },
  { id: "click", label: "Click", hint: "A click on a term opens its entry" },
  { id: "off", label: "Off", hint: "Terms show their hint only" },
];
function pickOpen(mode: GlossaryOpen): void {
  settings.set({ ...settings.current.value, glossaryOpen: mode });
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
      v-hint="'Settings: time zone, theme, beachball, deep dive marks and the glossary'"
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
      <div class="srow">
        <span class="slabel">Glossary underlines</span>
        <button
          v-hint="
            'Draws a faint dotted underline under the terms the Glossary in the Field manual explains'
          "
          type="button"
          class="theme-btn fixed"
          data-tour="settings.underlines"
          :aria-pressed="underlines"
          @click="toggleUnderlines"
        >
          {{ underlines ? "On" : "Off" }}
        </button>
      </div>
      <div class="srow">
        <span class="slabel">Open glossary on</span>
        <span class="sseg" role="group" aria-label="Open glossary on" data-tour="settings.glossary">
          <button
            v-for="o in OPENS"
            :key="o.id"
            v-hint="o.hint"
            type="button"
            :aria-pressed="settings.current.value.glossaryOpen === o.id"
            @click="pickOpen(o.id)"
          >
            {{ o.label }}
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
