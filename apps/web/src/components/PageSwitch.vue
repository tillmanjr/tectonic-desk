<script setup lang="ts">
import type { Page } from "../router.js";

defineProps<{ page: Page }>();
const emit = defineEmits<{ pick: [page: Page] }>();
const PAGES: { id: Page; label: string }[] = [
  { id: "active", label: "Active Earth" },
  { id: "earthquakes", label: "Earthquakes" },
  { id: "volcanoes", label: "Volcanoes" },
  { id: "space", label: "Space" },
];
</script>

<template>
  <nav class="pages" aria-label="Page">
    <button
      v-for="p in PAGES"
      :key="p.id"
      type="button"
      :aria-current="p.id === page ? 'page' : undefined"
      @click="emit('pick', p.id)"
    >
      {{ p.label }}
    </button>
  </nav>
</template>
