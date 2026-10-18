<script setup lang="ts">
import { ERUPTION_CLASSES } from "../lib/volcanoes.js";
</script>

<template>
  <span v-for="(c, code) in ERUPTION_CLASSES" :key="code" class="sw">
    <svg width="14" height="12" aria-hidden="true">
      <path d="M7,1L13,11L1,11Z" :style="{ fill: c.color, stroke: 'var(--ink)' }" />
    </svg>
    {{ c.label }}
  </span>
  <span class="sw">
    <svg width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" style="stroke: var(--av-orange)" stroke-width="2" />
    </svg>
    ring: agency alert above normal, in its aviation colour
  </span>
  <span class="sw">
    <svg width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="3" r="2.2" style="fill: var(--vc-recent); stroke: var(--ink)" />
      <path d="M7,6L12,13L2,13Z" style="fill: var(--vc-recent); stroke: var(--ink)" />
    </svg>
    dot above: eruption continuing per GVP
  </span>
  <span class="sw hint-sw"
    >Point at a volcano for its type, last eruption and status; click for its history.</span
  >
</template>
