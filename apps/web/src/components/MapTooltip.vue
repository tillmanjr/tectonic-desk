<script setup lang="ts">
import type { Tip } from "../lib/tip.js";

defineProps<{ tip: Tip | null }>();
</script>

<template>
  <div
    v-if="tip !== null"
    class="tip"
    :style="{ left: `${String(tip.x)}px`, top: `${String(tip.y)}px` }"
  >
    {{ tip.text }}
  </div>
</template>
