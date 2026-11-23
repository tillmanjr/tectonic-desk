<script setup lang="ts">
import { computed } from "vue";
import { fmtStamp } from "../lib/format.js";
import { vHint } from "../lib/hint.js";
import { PINS, useInjected, ZONE } from "../lib/keys.js";
import type { PinTool } from "../lib/pin-tool.js";
import { fmtLatLon, PIN_NAME_MAX, PIN_VIEW_LABELS, type PinView } from "../lib/pins.js";

/**
 * The strip under the map toolbar while the pin bar is open: placing, the
 * live coordinates, the pin's name, re-placing or removing it, and the
 * recent placements across both views.
 */
const props = defineProps<{ tool: PinTool; view: PinView }>();
const pins = useInjected(PINS);
const zone = useInjected(ZONE);
const { tool } = props;
const history = computed(() => pins.doc.value.history);
const where = computed(() => {
  const at = tool.armed.value ? tool.cursor.value : tool.shown.value;
  return at === null ? "—" : fmtLatLon(at[0], at[1]);
});
function rename(ev: Event): void {
  const t = ev.target;
  if (t instanceof HTMLInputElement) tool.rename(t.value);
}
</script>

<template>
  <div class="pinbar" role="group" aria-label="Map pin">
    <span class="ptitle">Pin · {{ PIN_VIEW_LABELS[view] }}</span>
    <span
      v-hint="'Latitude, longitude in decimal degrees (WGS84); south and west are negative.'"
      class="pcoords"
      aria-live="polite"
      >{{ where }}</span
    >
    <template v-if="tool.armed.value">
      <span class="pnote">Click the map to place the pin. Esc cancels.</span>
      <button type="button" @click="tool.cancel()">Cancel</button>
    </template>
    <template v-else-if="tool.pin.value !== null">
      <label
        v-hint="'An optional name, shown with the coordinates when the pointer rests on the pin.'"
        class="pname"
        >Name
        <input
          type="text"
          :value="tool.pin.value.name"
          :maxlength="PIN_NAME_MAX"
          placeholder="unnamed"
          @change="rename"
      /></label>
      <span class="pnote">Press and hold the pin to move it.</span>
      <button
        v-hint="'Click the map to drop the pin somewhere new; the old placement stays in Recent.'"
        type="button"
        @click="tool.arm()"
      >
        Re-place
      </button>
      <button
        v-hint="'Take the pin off this map view; it stays in Recent.'"
        type="button"
        @click="tool.remove()"
      >
        Remove
      </button>
    </template>
    <template v-else>
      <span class="pnote">No pin in this view.</span>
      <button type="button" @click="tool.arm()">Place</button>
    </template>
    <button type="button" class="pclose" aria-label="Close the pin bar" @click="tool.toggle()">
      ×
    </button>
    <details v-if="history.length > 0" class="precent">
      <summary>Recent ({{ history.length }})</summary>
      <ol>
        <li v-for="h in history" :key="h.id">
          <span class="pwhen">{{ fmtStamp(h.placed, zone) }}</span>
          <span class="pwho">{{ h.name === "" ? "unnamed" : h.name }}</span>
          <span class="pat">{{ fmtLatLon(h.lon, h.lat) }}</span>
          <span class="pview">{{ PIN_VIEW_LABELS[h.view] }}</span>
        </li>
      </ol>
    </details>
  </div>
</template>
