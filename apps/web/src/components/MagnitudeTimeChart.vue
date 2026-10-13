<script setup lang="ts">
import type { ApiEvent } from "@tectonic/shared";
import { scaleLinear, scaleUtc } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf } from "../lib/charts.js";
import { depthColor } from "../lib/depth.js";
import { fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected } from "../lib/keys.js";
import { sequenceOf } from "../lib/sequence.js";

const W = 520;
const H = 200;
const M = { l: 34, r: 10, t: 8, b: 24 };

type Dated = ApiEvent & { mag: number };
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);

const data = computed(() => {
  const region = catalog.requireRegion();
  const all = catalog.filtered.value;
  const evs = all.filter((e): e is Dated => e.mag !== null);
  if (evs.length === 0) return null;
  const now = clock.now.value;
  const minT = Math.min(...evs.map((e) => Date.parse(e.time)));
  const x = scaleUtc()
    .domain([new Date(minT), now])
    .range([M.l, W - M.r]);
  const y = scaleLinear()
    .domain([catalog.floor.value, Math.ceil(Math.max(...evs.map((e) => e.mag)))])
    .nice()
    .range([H - M.b, M.t]);
  const marks = [...evs]
    .sort((a, b) => a.mag - b.mag)
    .map((e) => ({ e, x: x(new Date(e.time)), y: y(e.mag) }));
  const big = evs.reduce((a, e) => (e.mag > a.mag ? e : a));
  const seq = sequenceOf(big, all, now);
  const share = seq === null ? 0 : Math.round(((seq.count + 1) / all.length) * 100);
  const caption =
    seq === null
      ? "Each stem is one event; colour is depth class."
      : `The M${fmtMag(big.mag)} ${placeOf(big).replace(/^.* of /, "")} event and its ${String(seq.count)} following events within 150 km account for ${String(share)}% of this window.`;
  return {
    marks,
    xTicks: ticksOf(x, region.id === "global" ? 7 : 6, "%b %-d"),
    yTicks: ticksOf(y, 5),
    caption,
  };
});
</script>

<template>
  <div class="panel chart">
    <h2>Magnitude through time</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(H)}`">
      <template v-if="data !== null">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="H"
          :margin="M"
        />
        <line
          v-for="m in data.marks"
          :key="`s${m.e.id}`"
          class="stem"
          :x1="m.x"
          :x2="m.x"
          :y1="H - M.b"
          :y2="m.y"
          style="stroke: var(--border)"
          stroke-width="0.6"
        />
        <circle
          v-for="m in data.marks"
          :key="m.e.id"
          :cx="m.x"
          :cy="m.y"
          :r="m.e.id === catalog.selectedId.value ? 5 : 3"
          :style="{
            fill: depthColor(m.e.depthKm),
            stroke: m.e.id === catalog.selectedId.value ? 'var(--ink)' : 'none',
            cursor: 'pointer',
          }"
          stroke-width="1.5"
          @click="select(m.e.id)"
        >
          <title>M{{ fmtMag(m.e.mag) }} {{ placeOf(m.e) }}</title>
        </circle>
      </template>
    </svg>
    <div class="cap">{{ data === null ? "No events in this window." : data.caption }}</div>
  </div>
</template>
