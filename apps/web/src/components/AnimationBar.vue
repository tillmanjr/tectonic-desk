<script setup lang="ts">
import type { Animation } from "../lib/animation.js";
import { fmtStamp } from "../lib/format.js";
import { useInjected, ZONE } from "../lib/keys.js";

/** The replay strip under the map toolbar: speed, step, start or pause, the clock and the count. */
const props = defineProps<{ anim: Animation; shown: number; total: number }>();
const zone = useInjected(ZONE);
/** The playback speed, bound to the input; a ref the animation owns. */
const secondsPerUnit = props.anim.secondsPerUnit;
function togglePlay(): void {
  if (props.anim.playing.value) props.anim.pause();
  else props.anim.play();
}
</script>

<template>
  <div v-if="anim.active.value && anim.cursor.value !== null" class="animbar">
    <label
      >Seconds per {{ anim.unit.value }}
      <input v-model.number="secondsPerUnit" type="number" min="0.1" step="0.5" />
    </label>
    <button
      type="button"
      class="zbtn"
      :aria-label="`Back one ${anim.unit.value}`"
      @click="anim.step(-1)"
    >
      ◀
    </button>
    <button
      type="button"
      class="zbtn play"
      :aria-label="anim.playing.value ? 'Pause' : 'Start'"
      @click="togglePlay"
    >
      {{ anim.playing.value ? "Pause" : "Start" }}
    </button>
    <button
      type="button"
      class="zbtn"
      :aria-label="`Forward one ${anim.unit.value}`"
      @click="anim.step(1)"
    >
      ▶
    </button>
    <span class="animclock num">{{ fmtStamp(anim.cursor.value.toISOString(), zone) }}</span>
    <span class="animcount">{{ shown }} of {{ total }} events</span>
    <span class="sp"></span>
    <button type="button" class="zbtn" style="width: auto; padding: 0 8px" @click="anim.close()">
      Close
    </button>
  </div>
</template>
