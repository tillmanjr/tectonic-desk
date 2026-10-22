<script setup lang="ts">
/** The two drawn arrows of an edge card: curving back to the left node, or straight up to the top node. */
defineProps<{ dir: "left" | "up"; small?: boolean }>();
</script>

<template>
  <svg
    v-if="dir === 'left'"
    class="ar arl"
    :class="{ sm: small }"
    viewBox="0 0 20 16"
    aria-hidden="true"
  >
    <path
      d="M15 13 V8 a3 3 0 0 0 -3 -3 H2.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M5 2.5 L2.5 5 L5 7.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <svg v-else class="ar" :class="{ sm: small }" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 13 V3"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M5 6 L8 3 L11 6"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
