<script setup lang="ts">
import type { ApiRegion } from "@tectonic/shared";
import { CATALOG, useInjected } from "../lib/keys.js";
import { vHint } from "../lib/hint.js";

const emit = defineEmits<{ pick: [id: string] }>();
const { regions, region } = useInjected(CATALOG);
/** The preset's floor and trailing window, short enough to sit beside its name: `M4.5+ · 7 d`. */
const windowOf = (r: ApiRegion): string => `M${String(r.minMag)}+ · ${String(r.days)} d`;
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Region" data-tour="regions">
    <button
      v-for="r in regions"
      :key="r.id"
      v-hint="r.subtitle"
      type="button"
      role="tab"
      :aria-selected="r.id === region?.id"
      @click="emit('pick', r.id)"
    >
      {{ r.name }}<small>{{ windowOf(r) }}</small>
    </button>
  </div>
</template>
