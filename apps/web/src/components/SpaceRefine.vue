<script setup lang="ts">
import DiveMark from "./DiveMark.vue";
import { computed, ref } from "vue";
import { CLOCK, SET_SPACE_RANGE, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { isWindowId, MAX_RANGE_MS, rangeBounds, WINDOWS, type SpaceRange } from "../lib/space.js";
import { aggregateNote } from "../lib/space-chart.js";
import { fromInputValue, toInputValue } from "../lib/space-format.js";
import { vHint } from "../lib/hint.js";

/**
 * The window in force: a length ending now, or a fixed range typed into the from and to
 * inputs. Picking a length goes back to live; editing either instant makes the range fixed.
 */
const store = useInjected(SPACE);
const setRange = useInjected(SET_SPACE_RANGE);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);

const range = computed(() => store.range.value);
const bounds = computed(() => rangeBounds(range.value, clock.now.value));
const selectValue = computed(() => (range.value.kind === "window" ? range.value.id : ""));
const zoneName = computed(() => (zone.value === "utc" ? "UTC" : "local"));
const bucketNote = computed(() => aggregateNote(store.window.value?.bucketSeconds ?? null));

function pickWindow(ev: Event): void {
  const t = ev.target;
  if (t instanceof HTMLSelectElement && isWindowId(t.value))
    setRange({ kind: "window", id: t.value });
}

const fromEl = ref<HTMLInputElement | null>(null);
const toEl = ref<HTMLInputElement | null>(null);

/** A new instant on either end fixes the range, as long as it stays forward and within the cap. */
function changeEnd(which: "from" | "to"): void {
  const el = which === "from" ? fromEl.value : toEl.value;
  const instant = fromInputValue(String(el?.value), zone.value);
  if (instant === null) return;
  const next: SpaceRange = {
    kind: "fixed",
    from: which === "from" ? instant : bounds.value.from,
    to: which === "to" ? instant : bounds.value.to,
  };
  const span = next.to.getTime() - next.from.getTime();
  if (span <= 0 || span > MAX_RANGE_MS) return;
  setRange(next);
}

/** Back to the window the reader had before fixing the range. */
function live(): void {
  setRange({ kind: "window", id: store.lastWindow.value });
}
</script>

<template>
  <section class="filters spacebar" aria-label="Space weather window" data-tour="space.window">
    <span class="ftitle">Window</span>
    <DiveMark area="Refine" dive="refine-space" />
    <select
      class="fspan"
      data-tour="space.span"
      :value="selectValue"
      aria-label="Window length"
      @change="pickWindow"
    >
      <option value="" disabled>Custom</option>
      <option v-for="w in WINDOWS" :key="w.id" :value="w.id">{{ w.label }}</option>
    </select>
    <span class="fto">from ({{ zoneName }})</span>
    <input
      ref="fromEl"
      type="datetime-local"
      class="fdate"
      data-tour="space.dates"
      :value="toInputValue(bounds.from, zone)"
      aria-label="From"
      @change="changeEnd('from')"
    />
    <span class="fto">to</span>
    <input
      ref="toEl"
      type="datetime-local"
      class="fdate"
      data-tour="space.dates"
      :value="toInputValue(bounds.to, zone)"
      aria-label="To"
      @change="changeEnd('to')"
    />
    <button
      v-hint="'Back to a window ending now'"
      type="button"
      class="fclear"
      data-tour="space.live"
      :disabled="range.kind === 'window'"
      @click="live"
    >
      Live
    </button>
    <span v-if="bucketNote !== ''" class="fnote" data-tour="space.bucket">{{ bucketNote }}</span>
  </section>
</template>
