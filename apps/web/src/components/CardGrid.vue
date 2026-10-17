<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { mustRef } from "../lib/dom.js";
import { CATALOG, useInjected } from "../lib/keys.js";

/**
 * A labelled card grid clipped to `rows` rows: the slot gets `limit`, how
 * many cards to render (null for all), and the label offers the rest.
 */
const props = defineProps<{ label: string; count: number; rows: number | null }>();
const catalog = useInjected(CATALOG);
const el = ref<HTMLElement | null>(null);
const columns = ref(1);
const expanded = ref(false);

function measure(): void {
  const cols = getComputedStyle(mustRef(el, "card grid"))
    .gridTemplateColumns.split(" ")
    .filter((c) => c !== "");
  columns.value = Math.max(1, cols.length);
}
const limit = computed(() =>
  props.rows === null || expanded.value ? null : props.rows * columns.value,
);
const hidden = computed(() => (limit.value === null ? 0 : Math.max(0, props.count - limit.value)));

watch(
  () => catalog.region.value?.id,
  () => {
    expanded.value = false;
  },
);
onMounted(() => {
  measure();
  window.addEventListener("resize", measure);
});
onUnmounted(() => {
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <p class="sectionlabel">
    {{ label }}
    <button
      v-if="hidden > 0 || expanded"
      type="button"
      class="more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? "show fewer" : `… ${String(hidden)} more` }}
    </button>
  </p>
  <section ref="el" class="major"><slot :limit="limit"></slot></section>
</template>
