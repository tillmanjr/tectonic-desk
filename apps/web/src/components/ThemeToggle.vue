<script setup lang="ts">
import { THEME, useInjected } from "../lib/keys.js";

const theme = useInjected(THEME);
</script>

<template>
  <button type="button" class="theme-btn" title="Cycle auto, light, dark" @click="theme.cycle()">
    Theme: {{ theme.mode.value }}
  </button>
</template>
