<script setup lang="ts">
import type { Tick } from "../lib/charts.js";

withDefaults(
  defineProps<{
    xTicks: Tick[];
    yTicks: Tick[];
    width: number;
    height: number;
    margin: { l: number; r: number; t: number; b: number };
    grid?: boolean;
  }>(),
  { grid: true },
);
</script>

<template>
  <g>
    <g v-if="grid" class="gridl">
      <line
        v-for="t in yTicks"
        :key="t.pos"
        :x1="margin.l"
        :x2="width - margin.r"
        :y1="t.pos"
        :y2="t.pos"
      />
    </g>
    <g class="axis">
      <line :x1="margin.l" :x2="width - margin.r" :y1="height - margin.b" :y2="height - margin.b" />
      <g v-for="t in xTicks" :key="t.pos">
        <line :x1="t.pos" :x2="t.pos" :y1="height - margin.b" :y2="height - margin.b + 5" />
        <text :x="t.pos" :y="height - margin.b + 15" text-anchor="middle">{{ t.label }}</text>
      </g>
    </g>
    <g class="axis">
      <line :x1="margin.l" :x2="margin.l" :y1="margin.t" :y2="height - margin.b" />
      <g v-for="t in yTicks" :key="t.pos">
        <line :x1="margin.l - 5" :x2="margin.l" :y1="t.pos" :y2="t.pos" />
        <text :x="margin.l - 8" :y="t.pos" dy="0.32em" text-anchor="end">{{ t.label }}</text>
      </g>
    </g>
  </g>
</template>
