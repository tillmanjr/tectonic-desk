<script setup lang="ts">
import type { ApiEvent } from "@tectonic/shared";
import { scaleLinear } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { depthColor } from "../lib/depth.js";
import { fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, SELECT, useInjected } from "../lib/keys.js";

const W = 520;
const M = { l: 40, r: 10, t: 8, b: 28 };
type Plotted = ApiEvent & { mag: number; depthKm: number };
interface Mark {
  e: Plotted;
  x: number;
  y: number;
}
interface Data {
  H: number;
  marks: Mark[];
  boundaries: number[];
  xTicks: Tick[];
  yTicks: Tick[];
  caption: string;
}

const catalog = useInjected(CATALOG);
const select = useInjected(SELECT);

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

const data = computed<Data>(() => {
  const region = catalog.requireRegion();
  const global = region.id === "global";
  const H = global ? 220 : 180;
  const maxD = global ? 700 : 35;
  const all = catalog.events.value;
  const evs = all.filter((e): e is Plotted => e.mag !== null && e.depthKm !== null);
  const noDepth = all.filter((e) => e.depthKm === null).length;
  if (evs.length === 0) {
    return {
      H,
      marks: [],
      boundaries: [],
      xTicks: [],
      yTicks: [],
      caption: "No events in this window.",
    };
  }
  const x = scaleLinear()
    .domain([region.minMag - 0.1, Math.ceil(Math.max(...evs.map((e) => e.mag))) + 0.1])
    .range([M.l, W - M.r]);
  const y = scaleLinear()
    .domain([Math.min(0, ...evs.map((e) => e.depthKm)), maxD])
    .range([M.t, H - M.b]);
  const marks = evs.map((e) => ({ e, x: x(e.mag), y: y(Math.min(e.depthKm, maxD)) }));
  const missing =
    noDepth === 0
      ? ""
      : ` ${plural(noDepth, "event", "events")} without a reported depth ${noDepth === 1 ? "is" : "are"} not plotted.`;
  let caption: string;
  if (global) {
    const sh = evs.filter((e) => e.depthKm < 70).length;
    const im = evs.filter((e) => e.depthKm >= 70 && e.depthKm < 300).length;
    const dp = evs.length - sh - im;
    caption = `${String(sh)} shallow, ${String(im)} intermediate, ${String(dp)} deep.${missing}`;
  } else {
    const neg = evs.filter((e) => e.depthKm < 0).length;
    caption = `Crustal seismicity; ${plural(neg, "event has", "events have")} negative depth (above the datum, as reported by the network).${missing}`;
  }
  return {
    H,
    marks,
    boundaries: global ? [70, 300].map((z) => y(z)) : [],
    xTicks: ticksOf(x, 8),
    yTicks: ticksOf(y, 6),
    caption,
  };
});
</script>

<template>
  <div class="panel chart">
    <h2>Depth distribution</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(data.H)}`">
      <template v-if="data.marks.length > 0">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="data.H"
          :margin="M"
        />
        <line
          v-for="b in data.boundaries"
          :key="b"
          class="boundary"
          :x1="M.l"
          :x2="W - M.r"
          :y1="b"
          :y2="b"
          style="stroke: var(--muted)"
          stroke-dasharray="2 3"
        />
        <text
          :x="M.l + 4"
          :y="data.H - M.b - 6"
          style="fill: var(--muted); font: 10.5px var(--f-data)"
        >
          depth km ↓ · magnitude →
        </text>
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
          fill-opacity="0.8"
          stroke-width="1.5"
          @click="select(m.e.id)"
        >
          <title>
            M{{ fmtMag(m.e.mag) }} · {{ m.e.depthKm.toFixed(0) }} km · {{ placeOf(m.e) }}
          </title>
        </circle>
      </template>
    </svg>
    <div class="cap">{{ data.caption }}</div>
  </div>
</template>
