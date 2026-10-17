<script setup lang="ts">
import { scaleLinear } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { useInjected, VOLCANOES } from "../lib/keys.js";

const W = 520;
const H = 180;
const M = { l: 40, r: 10, t: 8, b: 28 };
const BINS = ["0", "1", "2", "3", "4", "5", "6", "7", "?"];
const STEP = (W - M.l - M.r) / BINS.length;
const BAR = STEP * 0.8;

interface Bar {
  bin: string;
  n: number;
  x: number;
  y: number;
  h: number;
}
interface Data {
  bars: Bar[];
  xTicks: Tick[];
  yTicks: Tick[];
  caption: string;
}

const store = useInjected(VOLCANOES);

const data = computed<Data>(() => {
  const counts = new Map<string, number>();
  let uncertain = 0;
  let total = 0;
  for (const v of store.filtered.value) {
    for (const e of store.eruptionsOf.value.get(v.number) ?? []) {
      const bin = e.vei === null ? "?" : String(Math.min(7, Math.max(0, Math.round(e.vei))));
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
      if (e.veiModifier !== null) uncertain += 1;
      total += 1;
    }
  }
  if (total === 0) {
    return {
      bars: [],
      xTicks: [],
      yTicks: [],
      caption: "No eruption records among the volcanoes shown.",
    };
  }
  const y = scaleLinear()
    .domain([0, Math.max(...counts.values())])
    .nice()
    .range([H - M.b, M.t]);
  const bars = BINS.map((bin, i) => {
    const n = counts.get(bin) ?? 0;
    return { bin, n, x: M.l + i * STEP + (STEP - BAR) / 2, y: y(n), h: H - M.b - y(n) };
  });
  return {
    bars,
    xTicks: BINS.map((b, i) => ({ pos: M.l + (i + 0.5) * STEP, label: b === "?" ? "n/a" : b })),
    yTicks: ticksOf(y, 4),
    caption: `${String(total)} eruptions by Volcanic Explosivity Index; ${String(counts.get("?") ?? 0)} without a VEI and ${String(uncertain)} with a queried value. Prehistoric records favour large eruptions.`,
  };
});
</script>

<template>
  <div class="panel chart">
    <h2>VEI distribution</h2>
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
          :key="b.bin"
          :x="b.x"
          :y="b.y"
          :width="BAR"
          :height="b.h"
          :style="{ fill: b.bin === '?' ? 'var(--muted)' : 'var(--vc-recent)' }"
          fill-opacity="0.85"
        >
          <title>VEI {{ b.bin }}: {{ b.n }}</title>
        </rect>
      </template>
    </svg>
    <div class="cap">{{ data.caption }}</div>
  </div>
</template>
