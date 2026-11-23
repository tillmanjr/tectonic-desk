<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { vHint } from "../lib/hint.js";
import { UPDATED_MS, type SummaryPart } from "../lib/refine.js";

/**
 * The frame of a refine bar: collapsed it states the refinements in force,
 * expanded it shows the inputs in the default slot. Collapsed, a click
 * anywhere but the hide checkbox expands it; expanded, a click on its head
 * line folds it. The hide checkbox only takes this dataset's markers off the map.
 * Its status says whether what the page shows has caught up with the refinements:
 * "Updating…" while the data is fetched, "Updated" briefly once it lands, "Not updated"
 * when the fetch failed (the error in its hint).
 */
const props = withDefaults(
  defineProps<{
    dataset: "earthquakes" | "volcanoes";
    parts: SummaryPart[];
    hidden: boolean;
    /** The dataset is being fetched. */
    busy?: boolean;
    /** Why the last fetch failed; null when it did not. */
    error?: string | null;
  }>(),
  { busy: false, error: null },
);
const emit = defineEmits<{ "update:hidden": [value: boolean] }>();
const expanded = ref(false);
const updated = ref(false);
let updatedTimer: ReturnType<typeof setTimeout> | null = null;
function stopUpdated(): void {
  if (updatedTimer !== null) clearTimeout(updatedTimer);
  updatedTimer = null;
  updated.value = false;
}
watch(
  () => props.busy,
  (busy, was) => {
    stopUpdated();
    if (busy || !was || props.error !== null) return;
    updated.value = true;
    updatedTimer = setTimeout(stopUpdated, UPDATED_MS);
  },
);
onBeforeUnmount(stopUpdated);
const bodyId = `refine-${props.dataset}`;
function onHide(ev: Event): void {
  const t = ev.target;
  if (t instanceof HTMLInputElement) emit("update:hidden", t.checked);
}
function onBarClick(ev: MouseEvent): void {
  const t = ev.target;
  if (!(t instanceof Element) || t.closest(".rhide, a, button, input, select") !== null) return;
  if (expanded.value && t.closest(".rhead") === null) return;
  expanded.value = !expanded.value;
}
function onHeadKey(ev: KeyboardEvent): void {
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    expanded.value = !expanded.value;
  }
}
</script>

<template>
  <section
    class="filters refine"
    data-tour="refine"
    :class="[dataset, { expanded }]"
    :aria-label="`Refine ${dataset}`"
    @click="onBarClick"
  >
    <div
      v-hint="expanded ? 'Fold the inputs away' : 'Open the inputs'"
      class="rhead"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @keydown="onHeadKey"
    >
      <span class="ftitle">Refine</span>
      <span class="rwho">{{ dataset }}</span>
      <span v-if="!expanded" class="rsummary"
        ><template v-for="(p, i) in parts" :key="i"
          ><span v-if="i > 0" class="rsep"> · </span
          ><span :class="{ set: p.set }">{{ p.text }}</span></template
        ></span
      >
      <span class="rstate" role="status" :class="{ bad: !busy && error !== null }"
        ><template v-if="busy"><span class="spin" aria-hidden="true"></span>Updating…</template
        ><span v-else-if="error !== null" v-hint="`The data could not be fetched: ${error}`"
          >Not updated</span
        ><template v-else-if="updated">✓ Updated</template></span
      >
      <slot name="info"></slot>
    </div>
    <template v-if="expanded">
      <span class="rbreak"></span>
      <div :id="bodyId" class="rbody"><slot></slot></div>
    </template>
    <slot name="note"></slot>
    <label
      v-hint="
        `Takes the ${dataset} markers off the map without changing the refinements; the table, cards and charts are unaffected.`
      "
      class="rhide"
      ><input type="checkbox" :checked="hidden" @change="onHide" /> Hide markers</label
    >
  </section>
</template>
