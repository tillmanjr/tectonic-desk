<script setup lang="ts">
import { onUnmounted, ref } from "vue";

/** A destructive action that asks inline (`Delete? yes · no`) instead of with a dialog. */
defineProps<{ label: string }>();
const emit = defineEmits<{ confirm: [] }>();
const REVERT_MS = 5000;
const asking = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
function clear(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
function revert(): void {
  asking.value = false;
  clear();
}
function ask(): void {
  asking.value = true;
  clear();
  timer = setTimeout(revert, REVERT_MS);
}
function yes(): void {
  revert();
  emit("confirm");
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    revert();
  }
}
onUnmounted(clear);
</script>

<template>
  <span class="confirm" :class="{ asking }">
    <button v-if="!asking" type="button" @click="ask">{{ label }}</button>
    <template v-else>
      <span>{{ label }}?</span>
      <button type="button" class="yes" data-keep @click="yes" @keydown="onKey">yes</button>
      <button type="button" class="no" data-keep @click="revert" @keydown="onKey">no</button>
    </template>
  </span>
</template>
