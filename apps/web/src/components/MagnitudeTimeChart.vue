<script setup lang="ts">
import type { ApiEvent, SummaryBy } from "@tectonic/shared";
import { scaleLinear, scaleTime, scaleUtc, type ScaleTime } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf } from "../lib/charts.js";
import { depthColor } from "../lib/depth.js";
import { eraStart, erasWithin, type Era } from "../lib/eras.js";
import { fmtFloor, fmtInt, fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { sequenceOf } from "../lib/sequence.js";

const W = 520;
const H = 200;
const M = { l: 34, r: 10, t: 8, b: 24 };
/** Right margin in overview mode, which carries a magnitude axis on the right. */
const MR = 36;
/** Windows longer than this get d3's multi-scale tick labels instead of "Oct 7". */
const SHORT_DAYS = 120;

type Dated = ApiEvent & { mag: number };
interface EraMark {
  era: Era;
  x: number;
}

const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const zone = useInjected(ZONE);

/** The loaded window, never reaching past now. */
const domain = computed<[Date, Date]>(() => {
  const now = clock.now.value;
  const win = catalog.range.value;
  if (win !== null) {
    return [new Date(win.since), new Date(Math.min(Date.parse(win.until), now.getTime()))];
  }
  return [new Date(now.getTime() - catalog.requireRegion().days * 864e5), now];
});
const spanDays = computed(() => (domain.value[1].getTime() - domain.value[0].getTime()) / 864e5);

function xScale(right: number): ScaleTime<number, number> {
  return (zone.value === "utc" ? scaleUtc() : scaleTime())
    .domain(domain.value)
    .range([M.l, W - right]);
}
function xTicks(x: ScaleTime<number, number>, count: number) {
  return ticksOf(x, count, spanDays.value <= SHORT_DAYS ? "%b %-d" : undefined);
}
function eraMarks(x: (d: Date) => number): EraMark[] {
  return erasWithin(domain.value[0], domain.value[1]).map((era) => ({ era, x: x(eraStart(era)) }));
}
function erasSentence(marks: EraMark[]): string {
  if (marks.length === 0) return "";
  const list = marks.map((m) => `${String(m.era.year)} (${m.era.note})`).join("; ");
  return ` Dashed lines mark changes in the record, not in the Earth: ${list}.`;
}

function binEnd(start: Date, by: SummaryBy): Date {
  const d = new Date(start);
  if (by === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (by === "month") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
const binLabel = (start: string, by: SummaryBy): string =>
  start.slice(0, by === "year" ? 4 : by === "month" ? 7 : 10);

/** Overview mode: one bar and one dot per summary bin, when the floor was raised. */
const overview = computed(() => {
  const s = catalog.stats.value;
  if (s === null || !catalog.raised.value) return null;
  const x = xScale(MR);
  const requested = catalog.requested.value;
  const bins = s.bins;
  const yCount = scaleLinear()
    .domain([0, Math.max(1, ...bins.map((b) => b.count))])
    .nice()
    .range([H - M.b, M.t]);
  const mags = bins.flatMap((b) => (b.maxMag === null ? [] : [b.maxMag]));
  const yMag = scaleLinear()
    .domain([requested, Math.ceil(Math.max(requested + 1, ...mags))])
    .nice()
    .range([H - M.b, M.t]);
  const edges = bins.map((b) => {
    const start = new Date(b.start);
    return { b, x0: x(start), x1: x(binEnd(start, s.by)) };
  });
  const bars = edges.map(({ b, x0, x1 }) => ({
    key: b.start,
    x: x0,
    w: Math.max(1, x1 - x0 - 1),
    y: yCount(b.count),
    h: H - M.b - yCount(b.count),
  }));
  const dots = edges.flatMap(({ b, x0, x1 }) =>
    b.maxMag === null
      ? []
      : [
          {
            key: b.start,
            x: (x0 + x1) / 2,
            y: yMag(b.maxMag),
            title: `${binLabel(b.start, s.by)}: ${fmtInt(b.count)} events, largest M${fmtMag(b.maxMag)}`,
          },
        ],
  );
  const marks = eraMarks(x);
  const utc = zone.value === "local" ? " Bins are UTC." : "";
  return {
    bars,
    dots,
    marks,
    xTicks: xTicks(x, 7),
    yTicks: ticksOf(yCount, 5, "~s"),
    yRight: ticksOf(yMag, 5),
    caption: `Bars count events per ${s.by} at ${fmtFloor(requested)}; dots are the largest in each.${erasSentence(marks)}${utc}`,
  };
});

/** Per-event mode: a stem per event, when the whole window is loaded. */
const data = computed(() => {
  if (overview.value !== null) return null;
  const region = catalog.requireRegion();
  const all = catalog.filtered.value;
  const evs = all.filter((e): e is Dated => e.mag !== null);
  if (evs.length === 0) return null;
  const now = clock.now.value;
  const x = xScale(M.r);
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
  const eras = eraMarks(x);
  const caption =
    seq === null
      ? "Each stem is one event; colour is depth class."
      : `The M${fmtMag(big.mag)} ${placeOf(big).replace(/^.* of /, "")} event and its ${String(seq.count)} following events within 150 km account for ${String(share)}% of this window.`;
  return {
    marks,
    eras,
    xTicks: xTicks(x, region.id === "global" ? 7 : 6),
    yTicks: ticksOf(y, 5),
    caption: caption + erasSentence(eras),
  };
});

const caption = computed(
  () => overview.value?.caption ?? data.value?.caption ?? "No events in this window.",
);
</script>

<template>
  <div class="panel chart">
    <h2>Magnitude through time</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(H)}`">
      <template v-if="overview !== null">
        <ChartAxes
          :x-ticks="overview.xTicks"
          :y-ticks="overview.yTicks"
          :y-right-ticks="overview.yRight"
          :width="W"
          :height="H"
          :margin="{ ...M, r: MR }"
        />
        <rect
          v-for="b in overview.bars"
          :key="b.key"
          class="bin"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          style="fill: var(--border)"
          opacity="0.7"
        />
        <g v-for="m in overview.marks" :key="m.era.year" class="era">
          <line
            :x1="m.x"
            :x2="m.x"
            :y1="M.t"
            :y2="H - M.b"
            style="stroke: var(--muted)"
            stroke-dasharray="3 3"
          />
          <text :x="m.x + 3" :y="M.t + 9" style="fill: var(--muted); font: 10px var(--f-data)">
            {{ m.era.label }}
          </text>
        </g>
        <circle
          v-for="d in overview.dots"
          :key="d.key"
          class="binmax"
          :cx="d.x"
          :cy="d.y"
          r="3"
          style="fill: var(--accent)"
        >
          <title>{{ d.title }}</title>
        </circle>
      </template>
      <template v-else-if="data !== null">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="H"
          :margin="M"
        />
        <g v-for="m in data.eras" :key="m.era.year" class="era">
          <line
            :x1="m.x"
            :x2="m.x"
            :y1="M.t"
            :y2="H - M.b"
            style="stroke: var(--muted)"
            stroke-dasharray="3 3"
          />
          <text :x="m.x + 3" :y="M.t + 9" style="fill: var(--muted); font: 10px var(--f-data)">
            {{ m.era.label }}
          </text>
        </g>
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
    <div class="cap">{{ caption }}</div>
  </div>
</template>
