<script setup lang="ts">
import type { ApiSpaceFlare } from "@tectonic/shared";
import { computed } from "vue";
import { fmtStamp } from "../lib/format.js";
import { SET_SPACE_RANGE, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { windowLabel } from "../lib/space.js";
import { minutesBetween } from "../lib/space-format.js";

/**
 * The flares of the window, newest first. Hovering a row lights its band in the X-ray row;
 * clicking one fixes the range around it (an hour before to two hours after).
 */
const props = defineProps<{ highlight: string | null }>();
const emit = defineEmits<{ "update:highlight": [key: string | null] }>();
const store = useInjected(SPACE);
const setRange = useInjected(SET_SPACE_RANGE);
const zone = useInjected(ZONE);

const H = 3_600_000;

interface Row {
  key: string;
  max: string;
  cls: string;
  duration: string;
  f: ApiSpaceFlare;
}

/** The end of a flare for framing it: its end, else its peak, else its start. */
function endOf(f: ApiSpaceFlare): number {
  if (f.endTime !== null) return Date.parse(f.endTime);
  if (f.maxTime !== null) return Date.parse(f.maxTime);
  return Date.parse(f.beginTime);
}

const rows = computed<Row[]>(() => {
  const w = store.window.value;
  if (w === null) return [];
  return [...w.flares]
    .sort((a, b) => b.beginTime.localeCompare(a.beginTime))
    .map((f) => ({
      key: f.beginTime,
      max: fmtStamp(f.maxTime ?? f.beginTime, zone.value, { date: "monthday", label: false }),
      cls: f.maxClass ?? "—",
      duration:
        f.endTime === null
          ? "in progress"
          : `${String(minutesBetween(new Date(f.beginTime), new Date(f.endTime)))} min`,
      f,
    }));
});

/** True while the range is fixed, as it is after framing a flare. */
const framed = computed(() => store.range.value.kind === "fixed");
function back(): void {
  setRange({ kind: "window", id: store.lastWindow.value });
}

function frame(f: ApiSpaceFlare): void {
  setRange({
    kind: "fixed",
    from: new Date(Date.parse(f.beginTime) - H),
    to: new Date(endOf(f) + 2 * H),
  });
}
</script>

<template>
  <div class="panel spacepanel flares">
    <h2>Flares<span>GOES X-ray</span></h2>
    <p v-if="rows.length === 0" class="cap note">No flares in this window.</p>
    <table v-else class="spacetable">
      <thead>
        <tr>
          <th>Peak</th>
          <th>Class</th>
          <th>Length</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.key"
          class="flarerow"
          :class="{ hl: r.key === props.highlight }"
          tabindex="0"
          role="button"
          :title="`Frame this flare: ${r.cls} at ${r.max}`"
          @mouseenter="emit('update:highlight', r.key)"
          @mouseleave="emit('update:highlight', null)"
          @focus="emit('update:highlight', r.key)"
          @blur="emit('update:highlight', null)"
          @click="frame(r.f)"
          @keydown.enter="frame(r.f)"
        >
          <td class="num">{{ r.max }}</td>
          <td class="num">{{ r.cls }}</td>
          <td class="num">{{ r.duration }}</td>
        </tr>
      </tbody>
    </table>
    <p class="cap">
      <template v-if="framed"
        >The range is fixed; the list shows the flares inside it.
        <button type="button" class="fclear backbtn" @click="back">
          Back to {{ windowLabel(store.lastWindow.value) }}
        </button></template
      >
      <template v-else>Click a flare to frame it, an hour before to two hours after.</template>
    </p>
  </div>
</template>
