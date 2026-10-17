<script setup lang="ts">
import { scaleLinear, scaleLog } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { stepPath, ticksOf } from "../lib/charts.js";
import { CATALOG, useInjected } from "../lib/keys.js";
import { bValue, magnitudeBins } from "../lib/stats.js";

const W = 520;
const H = 200;
const M = { l: 40, r: 10, t: 8, b: 28 };
const catalog = useInjected(CATALOG);

const data = computed(() => {
  const region = catalog.requireRegion();
  const mc = catalog.floor.value;
  const mcSource = catalog.raised.value
    ? "window floor"
    : mc > region.minMag
      ? "filter minimum"
      : "catalog floor";
  const all = catalog.filtered.value;
  const mags = all.flatMap((e) => (e.mag === null ? [] : [e.mag]));
  if (mags.length === 0) return null;
  const bins = magnitudeBins(mags, mc);
  const maxM = Math.max(...bins.map((b) => b.m));
  const x = scaleLinear()
    .domain([mc - 0.1, maxM + 0.1])
    .range([M.l, W - M.r]);
  const y = scaleLog()
    .domain([0.8, mags.length * 1.3])
    .range([H - M.b, M.t]);
  const bars = bins
    .filter((b) => b.incremental > 0)
    .map((b) => ({
      m: b.m,
      x: x(b.m - 0.045),
      w: x(0.09) - x(0),
      y: y(b.incremental),
      h: y(0.8) - y(b.incremental),
    }));
  const cum = bins.map((b) => ({ x: x(b.m), y: y(b.cumulative) }));
  const bv = bValue(mags, mc);
  const n = mags.length;
  const fit =
    bv === null
      ? null
      : { x1: x(mc), y1: y(n), x2: x((Math.log10(n) + bv.b * mc) / bv.b), y2: y(1) };
  const label = bv === null ? null : `b = ${bv.b.toFixed(2)} ± ${bv.sigma.toFixed(2)}`;
  const types = [...new Set(all.flatMap((e) => (e.magType === null ? [] : [e.magType])))].join(
    ", ",
  );
  return {
    bars,
    line: stepPath(cum),
    dots: cum,
    fit,
    label,
    xTicks: ticksOf(x, 8),
    yTicks: ticksOf(y, 4, "~s"),
    caption: `Cumulative N(≥M) with incremental counts behind. b from the Aki (1965) maximum-likelihood estimator, Shi & Bolt (1982) uncertainty, Mc taken as the ${String(mc)} ${mcSource}. Mixed magnitude types (${types}); clustered sequences are not declustered, so treat it as descriptive.`,
  };
});
</script>

<template>
  <div class="panel chart">
    <h2>Frequency–magnitude</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(H)}`">
      <template v-if="data !== null">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="H"
          :margin="M"
        />
        <rect
          v-for="b in data.bars"
          :key="b.m"
          :x="b.x"
          :width="b.w"
          :y="b.y"
          :height="b.h"
          style="fill: var(--border)"
          opacity="0.7"
        />
        <path
          class="cum"
          :d="data.line"
          fill="none"
          style="stroke: var(--accent)"
          stroke-width="1.6"
        />
        <circle
          v-for="(d, i) in data.dots"
          :key="i"
          :cx="d.x"
          :cy="d.y"
          r="2.2"
          style="fill: var(--accent)"
        />
        <line
          v-if="data.fit !== null"
          class="fit"
          :x1="data.fit.x1"
          :y1="data.fit.y1"
          :x2="data.fit.x2"
          :y2="data.fit.y2"
          style="stroke: var(--ink)"
          stroke-dasharray="4 3"
          stroke-width="1"
        />
        <text
          v-if="data.label !== null"
          class="bval"
          :x="W - M.r - 4"
          :y="M.t + 12"
          text-anchor="end"
          style="fill: var(--ink); font: 500 12px var(--f-data)"
        >
          {{ data.label }}
        </text>
      </template>
    </svg>
    <div class="cap">{{ data === null ? "No events in this window." : data.caption }}</div>
  </div>
</template>
