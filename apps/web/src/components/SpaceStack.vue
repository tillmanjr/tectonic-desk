<script setup lang="ts">
import { SPACE_SERIES, type SpaceSeries } from "@tectonic/shared";
import { scaleLinear, scaleLog, scaleTime, scaleUtc, type ScaleTime } from "d3-scale";
import { computed, ref } from "vue";
import ChartAxes from "./ChartAxes.vue";
import SpaceRow from "./SpaceRow.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { fmtClock, fmtStamp } from "../lib/format.js";
import { SPACE, useInjected, ZONE } from "../lib/keys.js";
import {
  flareBands,
  gapMs,
  kpBars,
  linePath,
  nearestIndex,
  ROWS,
  viewX,
  type Points,
  type RowData,
  type RowLine,
  type RowSpec,
} from "../lib/space-chart.js";
import { alertTitle, fmtKp, fmtValue, xrayClass } from "../lib/space-format.js";

/**
 * Every series of the window on one time axis, a row each, so a storm reads top to bottom at
 * one instant. SWPC alerts are ticks along the top, flares shade the X-ray row, and a pointer
 * over the stack reads every row at that moment.
 */
const props = defineProps<{ highlight: string | null }>();
const store = useInjected(SPACE);
const zone = useInjected(ZONE);

const W = 900;
const M = { l: 52, r: 52, t: 16, b: 24 };
const ROW_H = 70;
const ROW_GAP = 10;
const H = M.t + ROWS.length * ROW_H - ROW_GAP + M.b;

interface AlertTick {
  key: string;
  x: number;
  title: string;
}
interface Stack {
  rows: RowData[];
  xTicks: Tick[];
  alerts: AlertTick[];
  x: ScaleTime<number, number>;
  samples: Record<SpaceSeries, Points>;
  bucketSeconds: number | null;
}

const SHORT: Record<SpaceSeries, string> = {
  kp_1m: "Kp",
  kp_3h: "3-h",
  dst: "Dst",
  bz_gsm: "Bz",
  bt: "Bt",
  speed: "",
  density: "",
  xray_long: "long",
  xray_short: "short",
  p10: "≥10",
  p100: "≥100",
  hp_north: "N",
  hp_south: "S",
};

/** A value in the row's own words: Kp in thirds, flux as a class, the rest to a decimal or two. */
function fmtSeries(s: SpaceSeries, v: number): string {
  if (s === "kp_3h") return fmtKp(v);
  if (s === "xray_long" || s === "xray_short") return xrayClass(v);
  return fmtValue(v, s === "kp_1m" || s === "p10" || s === "p100" || s === "density" ? 2 : 1);
}

function buildRow(
  spec: RowSpec,
  i: number,
  s: Stack["samples"],
  x: Stack["x"],
  bucket: number | null,
  flareKeys: { key: string; startMs: number; endMs: number; label: string }[],
): RowData {
  const top = M.t + i * ROW_H;
  const bottom = top + ROW_H - ROW_GAP;
  const values = spec.series.flatMap((id) => s[id].map((p) => p[1]));
  const [lo, hi] = spec.domain(values);
  const isLog = spec.scale === "log";
  const yScale = isLog
    ? scaleLog().domain([lo, hi]).range([bottom, top])
    : scaleLinear().domain([lo, hi]).range([bottom, top]);
  // A log scale cannot place zero or a negative flux; the line lifts its pen there.
  const y = (v: number): number => (isLog && v <= 0 ? Number.NaN : yScale(v));
  const ticks = spec.ticks;
  const label = spec.tickLabel;
  const yTicks: Tick[] =
    ticks !== null && label !== null
      ? ticks(lo, hi).map((v) => ({ pos: yScale(v), label: label(v) }))
      : ticksOf(yScale, 3);
  const lines: RowLine[] = spec.series
    .filter((id) => id !== "kp_3h")
    .map((id) => ({ series: id, d: linePath(s[id], x, y, gapMs(id, bucket)) }));
  let yRight: Tick[] = [];
  let rightUnit: string | null = null;
  const right = spec.right;
  if (right !== null) {
    const rv = s[right.series].map((p) => p[1]);
    const [rlo, rhi] = right.domain(rv);
    const yr = scaleLinear().domain([rlo, rhi]).range([bottom, top]);
    yRight = ticksOf(yr, 3);
    rightUnit = right.unit;
    lines.push({
      series: right.series,
      d: linePath(s[right.series], x, yr, gapMs(right.series, bucket)),
    });
  }
  const refs = spec.refs
    .filter((r) => r.value >= lo && r.value <= hi)
    .map((r) => ({ y: yScale(r.value), label: r.label }));
  const read: SpaceSeries[] = [...spec.series];
  if (right !== null) read.push(right.series);
  return {
    read,
    id: spec.id,
    label: spec.label,
    unit: spec.unit,
    rightUnit,
    top,
    bottom,
    yTicks,
    yRight,
    refs,
    lines,
    bars: spec.id === "kp" ? kpBars(s.kp_3h, x, y, bottom) : [],
    bands:
      spec.id === "xray"
        ? flareKeys.map((b) => ({
            key: b.key,
            x: x(b.startMs),
            w: Math.max(2, x(b.endMs) - x(b.startMs)),
            label: b.label,
            hl: b.key === props.highlight,
          }))
        : [],
  };
}

const data = computed<Stack | null>(() => {
  const w = store.window.value;
  if (w === null || !SPACE_SERIES.some((id) => w.samples[id].length > 0)) return null;
  const from = Date.parse(w.from);
  const to = Date.parse(w.to);
  const x = (zone.value === "utc" ? scaleUtc() : scaleTime())
    .domain([from, to])
    .range([M.l, W - M.r]);
  const spanDays = (to - from) / 864e5;
  const xTicks = ticksOf(x, 8, spanDays <= 3 ? "%H:%M" : "%b %-d");
  const bands = flareBands(w.flares, to);
  const rows = ROWS.map((spec, i) => buildRow(spec, i, w.samples, x, w.bucketSeconds, bands));
  const alerts = w.alerts.flatMap((a) => {
    const ms = Date.parse(a.issueTime);
    if (ms < from || ms > to) return [];
    return [
      {
        key: `${a.productId}${a.issueTime}`,
        x: x(ms),
        title: `${fmtClock(a.issueTime, zone.value)} · ${alertTitle(a.message)}`,
      },
    ];
  });
  return { rows, xTicks, alerts, x, samples: w.samples, bucketSeconds: w.bucketSeconds };
});

const caption = computed(() => {
  const d = data.value;
  if (d === null) return "No samples yet.";
  const points =
    d.bucketSeconds === null
      ? "Stored samples"
      : `Points are ${String(Math.round(d.bucketSeconds / 60))}-minute means`;
  return `${points}. Kp bars are the 3-hour values coloured by G level under the 1-minute estimate; the X-ray row shades flares; triangles along the top are SWPC alerts and warnings. Hover for the values at one instant.`;
});

/** The pointer in viewBox units, or null when it is off the plot. */
const pointer = ref<number | null>(null);
function onMove(ev: PointerEvent): void {
  const px = viewX(ev, W);
  pointer.value = px === null || px < M.l || px > W - M.r ? null : px;
}
function onLeave(): void {
  pointer.value = null;
}

interface CrossRow {
  id: string;
  y: number;
  text: string;
}
const cross = computed<{ x: number; stamp: string; rows: CrossRow[] } | null>(() => {
  const d = data.value;
  const px = pointer.value;
  if (d === null || px === null) return null;
  const ms = d.x.invert(px).getTime();
  const rows = d.rows.map((row) => {
    const parts = row.read.flatMap((id) => {
      const pts = d.samples[id];
      const i = nearestIndex(pts, ms);
      const pt = pts[i];
      if (pt === undefined || Math.abs(pt[0] - ms) > gapMs(id, d.bucketSeconds)) return [];
      const short = SHORT[id];
      return [`${short === "" ? "" : `${short} `}${fmtSeries(id, pt[1])}`];
    });
    return { id: row.id, y: row.top + 9, text: parts.join(" · ") };
  });
  return {
    x: px,
    stamp: fmtStamp(new Date(ms).toISOString(), zone.value, { date: "monthday" }),
    rows,
  };
});
</script>

<template>
  <div class="panel chart spacestack">
    <h2>Series<span>one time axis</span></h2>
    <svg
      v-if="data !== null"
      class="stacksvg"
      :viewBox="`0 0 ${String(W)} ${String(H)}`"
      @pointermove="onMove"
      @pointerleave="onLeave"
    >
      <ChartAxes
        :x-ticks="data.xTicks"
        :y-ticks="[]"
        :width="W"
        :height="H"
        :margin="M"
        :grid="false"
      />
      <g class="alertticks">
        <path v-for="a in data.alerts" :key="a.key" :d="`M${String(a.x)},3l4,8h-8z`">
          <title>{{ a.title }}</title>
        </path>
      </g>
      <SpaceRow v-for="row in data.rows" :key="row.id" :row="row" :left="M.l" :right="W - M.r" />
      <g v-if="cross !== null" class="cross">
        <line :x1="cross.x" :x2="cross.x" :y1="M.t" :y2="H - M.b" />
        <text :x="cross.x" :y="M.t - 4" :text-anchor="cross.x > W / 2 ? 'end' : 'start'">
          {{ cross.stamp }}
        </text>
        <text
          v-for="r in cross.rows"
          :key="r.id"
          :x="cross.x > W / 2 ? cross.x - 6 : cross.x + 6"
          :y="r.y"
          :text-anchor="cross.x > W / 2 ? 'end' : 'start'"
        >
          {{ r.text }}
        </text>
      </g>
    </svg>
    <p class="cap" :class="{ note: data === null }">{{ caption }}</p>
  </div>
</template>
