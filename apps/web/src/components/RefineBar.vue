<script setup lang="ts">
import { ref } from "vue";
import type { SummaryPart } from "../lib/refine.js";

/**
 * The frame of a refine bar: collapsed it states the refinements in force,
 * expanded it shows the inputs in the default slot. The hide checkbox only
 * takes this dataset's markers off the map.
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
</script>

<template>
  <section
    class="filters refine"
    :class="[dataset, { expanded }]"
    :aria-label="`Refine ${dataset}`"
  >
    <span class="ftitle">Refine</span>
    <span class="rwho">{{ dataset }}</span>
    <span v-if="!expanded" class="rsummary"
      ><template v-for="(p, i) in parts" :key="i"
        ><span v-if="i > 0" class="rsep"> · </span
        ><span :class="{ set: p.set }">{{ p.text }}</span></template
      ></span
    >
    <button
      type="button"
      class="rtoggle"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="expanded = !expanded"
    >
      {{ expanded ? "done" : "edit" }}
    </button>
    <slot name="info"></slot>
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
