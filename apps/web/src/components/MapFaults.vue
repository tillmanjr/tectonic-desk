<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import {
  FAULT_AGES,
  FAULT_CERTS,
  FAULT_WIDTH,
  type AgeCode,
  type Cert,
  type FaultFeature,
} from "../lib/faults.js";
import { pathOf } from "../lib/geo.js";

const props = defineProps<{
  path: GeoPath;
  features: FaultFeature[];
  /** The trace under the pointer, drawn again on top in the accent colour. */
  hovered: FaultFeature | null;
}>();

interface ClassPath {
  key: string;
  age: AgeCode;
  cert: Cert;
  d: string;
}

/** One path per age and certainty class: thousands of traces, a handful of nodes. */
const classes = computed<ClassPath[]>(() => {
  const parts = new Map<string, ClassPath>();
  for (const f of props.features) {
    const { age, cert } = f.properties;
    const key = `${age}-${cert}`;
    const d = pathOf(props.path, f);
    const existing = parts.get(key);
    if (existing === undefined) parts.set(key, { key, age, cert, d });
    else existing.d += d;
  }
  return [...parts.values()];
});
const hot = computed(() => (props.hovered === null ? null : pathOf(props.path, props.hovered)));
</script>

<template>
  <g class="faults" style="pointer-events: none">
    <path
      v-for="c in classes"
      :key="c.key"
      class="qf"
      :d="c.d"
      fill="none"
      :style="{ stroke: FAULT_AGES[c.age].color }"
      :stroke-width="FAULT_WIDTH"
      :stroke-dasharray="FAULT_CERTS[c.cert].dash ?? undefined"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
    <path
      v-if="hot !== null"
      class="hot"
      :d="hot"
      fill="none"
      style="stroke: var(--accent)"
      :stroke-width="FAULT_WIDTH + 1.4"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </g>
</template>
