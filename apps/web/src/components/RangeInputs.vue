<script setup lang="ts">
import { ref } from "vue";
import { parseBound } from "../lib/filters.js";

/** A min–max pair of number inputs for a table filter row; emits both bounds on either change. */
withDefaults(
  defineProps<{
    min: number | null;
    max: number | null;
    /** Names the two inputs: "<label> from" and "<label> to". */
    label: string;
    step?: string;
    placeholderMin?: string;
    placeholderMax?: string;
  }>(),
  { step: "any", placeholderMin: "min", placeholderMax: "max" },
);
const emit = defineEmits<{ update: [{ min: number | null; max: number | null }] }>();
const lo = ref<HTMLInputElement | null>(null);
const hi = ref<HTMLInputElement | null>(null);

function change(): void {
  emit("update", { min: parseBound(lo.value?.value), max: parseBound(hi.value?.value) });
}
const text = (v: number | null): string => (v === null ? "" : String(v));
</script>

<template>
  <span class="range">
    <input
      ref="lo"
      type="number"
      :step="step"
      :class="{ set: min !== null }"
      :value="text(min)"
      :placeholder="placeholderMin"
      :aria-label="`${label} from`"
      @change="change"
    />
    <span class="dash">–</span>
    <input
      ref="hi"
      type="number"
      :step="step"
      :class="{ set: max !== null }"
      :value="text(max)"
      :placeholder="placeholderMax"
      :aria-label="`${label} to`"
      @change="change"
    />
  </span>
</template>
