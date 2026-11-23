<script setup lang="ts">
import { THEME, useInjected } from "../lib/keys.js";
import { vHint } from "../lib/hint.js";

const theme = useInjected(THEME);
</script>

<template>
  <button
    v-hint="'Cycle auto, light, dark'"
    type="button"
    class="theme-btn fixed"
    @click="theme.cycle()"
  >
    Theme: {{ theme.mode.value }}
  </button>
</template>
