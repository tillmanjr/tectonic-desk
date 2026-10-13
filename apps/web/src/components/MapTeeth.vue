<script setup lang="ts">
import { computed } from "vue";
import type { MapFrame, PlateSegment } from "../lib/geo.js";
import { polarity, teethPath, type ProjectedPoint } from "../lib/teeth.js";

const props = defineProps<{
  frame: MapFrame;
  segments: PlateSegment[];
  k: number;
  /** Index into `segments` of the boundary under the pointer, if any. */
  highlight: number | null;
}>();

const projected = computed(() =>
  props.segments.flatMap((s, i) => {
    const side = s.c === "sub" ? polarity(s.b) : null;
    if (side === null) return [];
    const points: ProjectedPoint[] = s.p.map((c) => props.frame.projection(c));
    return [{ key: i, side, points }];
  }),
);
const teeth = computed(() =>
  projected.value.map((t) => ({ key: t.key, d: teethPath(t.points, props.k, t.side) })),
);
</script>

<template>
  <g>
    <path
      v-for="t in teeth"
      :key="t.key"
      :class="{ hot: t.key === highlight }"
      :d="t.d"
      :style="{ fill: t.key === highlight ? 'var(--accent)' : 'var(--plate)' }"
      fill-opacity="0.9"
    />
  </g>
</template>
