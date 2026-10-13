<script setup lang="ts">
import { CATALOG, useInjected } from "../lib/keys.js";

const emit = defineEmits<{ pick: [id: string] }>();
const { regions, region } = useInjected(CATALOG);
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Region">
    <button
      v-for="r in regions"
      :key="r.id"
      type="button"
      role="tab"
      :aria-selected="r.id === region?.id"
      @click="emit('pick', r.id)"
    >
      {{ r.name }}<small>{{ r.subtitle }}</small>
    </button>
  </div>
</template>
