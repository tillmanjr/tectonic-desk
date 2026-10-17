<script setup lang="ts">
import { scaleLinear } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { CLOCK, useInjected, VOLCANOES } from "../lib/keys.js";

const W = 520;
const H = 200;
const M = { l: 40, r: 10, t: 8, b: 28 };
const FROM = 1800;

interface Bar {
  decade: number;
  n: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Data {
  bars: Bar[];
  xTicks: Tick[];
  yTicks: Tick[];
  caption: string;
}

const store = useInjected(VOLCANOES);
const clock = useInjected(CLOCK);

const data = computed<Data>(() => {
  const thisDecade = Math.floor(clock.now.value.getUTCFullYear() / 10) * 10;
  const decades: number[] = [];
  for (let d = FROM; d <= thisDecade; d += 10) decades.push(d);
  const counts = new Map<number, number>();
  let earlier = 0;
  let total = 0;
  for (const v of store.filtered.value) {
    for (const e of store.eruptionsOf.value.get(v.number) ?? []) {
      if (e.startYear < FROM) {
        earlier += 1;
        continue;
      }
      const d = Math.min(thisDecade, Math.floor(e.startYear / 10) * 10);
      counts.set(d, (counts.get(d) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) {
    return {
      bars: [],
      xTicks: [],
      yTicks: [],
      caption: "No eruptions since 1800 among the volcanoes shown.",
    };
  }
  const step = (W - M.l - M.r) / decades.length;
  const w = step * 0.85;
  const y = scaleLinear()
    .domain([0, Math.max(...counts.values())])
    .nice()
    .range([H - M.b, M.t]);
  const bars = decades.map((decade, i) => {
    const n = counts.get(decade) ?? 0;
    return { decade, n, x: M.l + i * step + (step - w) / 2, y: y(n), w, h: H - M.b - y(n) };
  });
  const xTicks = decades.flatMap((d, i) =>
    d % 50 === 0 ? [{ pos: M.l + (i + 0.5) * step, label: String(d) }] : [],
  );
  return {
    bars,
    xTicks,
    yTicks: ticksOf(y, 5),
    caption: `${String(total)} eruption starts since 1800 across ${String(store.filtered.value.length)} volcanoes; ${String(earlier)} earlier. The rise toward the present is largely better observation and reporting, not more volcanism.`,
  };
});
</script>

<template>
  <div class="panel chart">
    <h2>Eruption starts per decade</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(H)}`">
      <template v-if="data.bars.length > 0">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="H"
          :margin="M"
        />
        <rect
          v-for="b in data.bars"
          :key="b.decade"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          style="fill: var(--vc-historic)"
          fill-opacity="0.85"
        >
          <title>{{ b.decade }}s: {{ b.n }}</title>
        </rect>
      </template>
    </svg>
    <div class="cap">{{ data.caption }}</div>
  </div>
</template>
