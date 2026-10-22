<script setup lang="ts">
import { ref } from "vue";
import type { SummaryPart } from "../lib/refine.js";

/**
 * The frame of a refine bar: collapsed it states the refinements in force,
 * expanded it shows the inputs in the default slot. Collapsed, a click
 * anywhere but the hide checkbox expands it; expanded, a click on its head
 * line folds it. The hide checkbox only takes this dataset's markers off the map.
 */
const props = defineProps<{
  dataset: "earthquakes" | "volcanoes";
  parts: SummaryPart[];
  hidden: boolean;
}>();
const emit = defineEmits<{ "update:hidden": [value: boolean] }>();
const expanded = ref(false);
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
    :class="[dataset, { expanded }]"
    :aria-label="`Refine ${dataset}`"
    @click="onBarClick"
  >
    <div
      class="rhead"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      :title="expanded ? 'Fold the inputs away' : 'Open the inputs'"
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
      <slot name="info"></slot>
    </div>
    <template v-if="expanded">
      <span class="rbreak"></span>
      <div :id="bodyId" class="rbody"><slot></slot></div>
    </template>
    <slot name="note"></slot>
    <label class="rhide"
      ><input type="checkbox" :checked="hidden" @change="onHide" /> Hide markers</label
    >
  </section>
</template>
