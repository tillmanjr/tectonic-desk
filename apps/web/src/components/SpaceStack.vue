<script setup lang="ts">
import { SPACE_SERIES, type SpaceSeries } from "@tectonic/shared";
import { scaleLinear, scaleLog, scaleTime, scaleUtc, type ScaleTime } from "d3-scale";
import { computed, ref } from "vue";
import ChartAxes from "./ChartAxes.vue";
import SpaceRow from "./SpaceRow.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { cycleMarks } from "../lib/cycles.js";
import { eraLabels, type EraLabel } from "../lib/eras.js";
import { fmtClock, fmtStamp } from "../lib/format.js";
import { AURORA, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { isLongRange } from "../lib/space.js";
import {
  AGGREGATE_WORDS,
  bucketWords,
  CADENCE_MS,
  flareBands,
  gapMs,
  kpBars,
  linePath,
  nearestIndex,
  rowsFor,
  splitAt,
  kpStepPath,
  viewX,
  type Points,
  type RowData,
  type RowLine,
  type RowSpec,
} from "../lib/space-chart.js";
import { alertTitle, fmtKp, fmtThirds, fmtValue, xrayClass } from "../lib/space-format.js";

/**
 * Every series of the window on one time axis, a row each, so a storm reads top to bottom at
 * one instant. SWPC alerts are ticks along the top, flares shade the X-ray row, and a pointer
 * over the stack reads every row at that moment. Past 93 days the stack shows the long record
 * (GFZ Kp, Dst, sunspots with F10.7) with the solar-cycle minima marked.
 */
const props = defineProps<{ highlight: string | null }>();
const store = useInjected(SPACE);
const aurora = useInjected(AURORA);
const zone = useInjected(ZONE);

const W = 900;
const M = { l: 52, r: 52, t: 16, b: 24 };
const ROW_H = 70;
const ROW_GAP = 10;
const heightFor = (rows: number): number => M.t + rows * ROW_H - ROW_GAP + M.b;

interface AlertTick {
  key: string;
  x: number;
  title: string;
}
interface Stack {
  rows: RowData[];
  h: number;
  long: boolean;
  xTicks: Tick[];
  alerts: AlertTick[];
  cycles: EraLabel[];
  x: ScaleTime<number, number>;
  samples: Record<SpaceSeries, Points>;
  bucketSeconds: number | null;
  /** Epoch ms from which GFZ Kp is still preliminary, or null. */
  preMs: number | null;
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
  kp_gfz: "GFZ",
  ap: "Ap",
  ssn: "SSN",
  f107: "F10.7",
};

/** A value in the row's own words: Kp in thirds, flux as a class, the rest to a decimal or two. */
function fmtSeries(s: SpaceSeries, v: number): string {
  if (s === "kp_3h" || s === "kp_gfz") return fmtKp(v);
  if (s === "xray_long" || s === "xray_short") return xrayClass(v);
  if (s === "ssn") return fmtValue(v, 0);
  return fmtValue(v, s === "kp_1m" || s === "p10" || s === "p100" || s === "density" ? 2 : 1);
}

/** The Kp row's lines: none at a long range; else the 1-minute line and GFZ's step, dashed once preliminary. */
function kpLines(
  s: Stack["samples"],
  x: Stack["x"],
  y: (v: number) => number,
  bucket: number | null,
  long: boolean,
  preMs: number | null,
): RowLine[] {
  if (long) return [];
  const lines: RowLine[] = [
    { series: "kp_1m", d: linePath(s.kp_1m, x, y, gapMs("kp_1m", bucket)) },
  ];
  const gap = gapMs("kp_gfz", bucket);
  const { before, after } = splitAt(s.kp_gfz, preMs);
  if (before.length > 0) {
    lines.push({ series: "kp_gfz", d: kpStepPath(before, x, y, gap, CADENCE_MS.kp_gfz) });
  }
  if (after.length > 0) {
    lines.push({
      series: "kp_gfz",
      cls: "pre",
      d: kpStepPath(after, x, y, gap, CADENCE_MS.kp_gfz),
    });
  }
  return lines;
}

function buildRow(
  spec: RowSpec,
  i: number,
  s: Stack["samples"],
  x: Stack["x"],
  bucket: number | null,
  long: boolean,
  preMs: number | null,
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
  const lines: RowLine[] =
    spec.id === "kp"
      ? kpLines(s, x, y, bucket, long, preMs)
      : spec.series.map((id) => ({ series: id, d: linePath(s[id], x, y, gapMs(id, bucket)) }));
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
  const read: SpaceSeries[] = spec.id === "kp" && long ? ["kp_gfz"] : [...spec.series];
  if (right !== null) read.push(right.series);
  const barWidth = Math.max(CADENCE_MS.kp_3h, (bucket ?? 0) * 1000);
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
    bars: spec.id === "kp" ? kpBars(long ? s.kp_gfz : s.kp_3h, x, y, bottom, barWidth) : [],
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
  const long = isLongRange(new Date(from), new Date(to));
  const x = (zone.value === "utc" ? scaleUtc() : scaleTime())
    .domain([from, to])
    .range([M.l, W - M.r]);
  const spanDays = (to - from) / 864e5;
  const xTicks = ticksOf(x, 8, spanDays <= 3 ? "%H:%M" : spanDays <= 120 ? "%b %-d" : "%Y");
  const bands = flareBands(w.flares, to);
  const preMs = w.preliminaryKpFrom === null ? null : Date.parse(w.preliminaryKpFrom);
  const rows = rowsFor(long).map((spec, i) =>
    buildRow(spec, i, w.samples, x, w.bucketSeconds, long, preMs, bands),
  );
  const alerts = long
    ? []
    : w.alerts.flatMap((a) => {
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
  const cycles = eraLabels(cycleMarks(new Date(from), new Date(to), (d) => x(d)));
  return {
    rows,
    h: heightFor(rows.length),
    long,
    xTicks,
    alerts,
    cycles,
    x,
    samples: w.samples,
    bucketSeconds: w.bucketSeconds,
    preMs,
  };
});

/**
 * Where the aurora frame on show falls on the axis, while a past frame is chosen (a scrub or a
 * replay) and its forecast time lies inside the window; nothing while following live.
 */
const marker = computed<number | null>(() => {
  const d = data.value;
  const f = aurora.frame.value;
  if (d === null || f === null || aurora.selected.value === null) return null;
  const x = d.x(Date.parse(f.forecast));
  return x < M.l || x > W - M.r ? null : x;
});

const caption = computed(() => {
  const d = data.value;
  if (d === null) return "No samples yet.";
  const points =
    d.bucketSeconds === null
      ? "Stored samples"
      : `Points are ${bucketWords(d.bucketSeconds)} ${AGGREGATE_WORDS}`;
  const cycles =
    d.cycles.length === 0
      ? ""
      : ` Dashed lines mark solar-cycle minima: ${d.cycles.map((c) => `${c.era.label} (${c.era.note})`).join("; ")}.`;
  if (d.long) {
    return `${points}. Kp bars are GFZ's definitive 3-hour index coloured by G level, the bucket's largest value.${cycles} Hover for the values at one instant.`;
  }
  return `${points}. Kp bars are the 3-hour values coloured by G level under the 1-minute estimate; the thin step is GFZ's Kp, dashed while preliminary; the X-ray row shades flares; triangles along the top are SWPC alerts and warnings.${cycles} Hover for the values at one instant.`;
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

/** The point of a series nearest the instant, if one lies within the series' gap. */
function pointAt(d: Stack, id: SpaceSeries, ms: number): [number, number] | null {
  const pts = d.samples[id];
  const pt = pts[nearestIndex(pts, ms)];
  if (pt === undefined || Math.abs(pt[0] - ms) > gapMs(id, d.bucketSeconds)) return null;
  return pt;
}

const cross = computed<{ x: number; stamp: string; rows: CrossRow[] } | null>(() => {
  const d = data.value;
  const px = pointer.value;
  if (d === null || px === null) return null;
  const ms = d.x.invert(px).getTime();
  const rows = d.rows.map((row) => {
    const parts = row.read.flatMap((id) => {
      const pt = pointAt(d, id, ms);
      if (pt === null) return [];
      const short = SHORT[id];
      const prelim = id === "kp_gfz" && d.preMs !== null && pt[0] >= d.preMs ? " (prelim.)" : "";
      return [`${short === "" ? "" : `${short} `}${fmtSeries(id, pt[1])}${prelim}`];
    });
    if (row.id === "kp" && !d.long) {
      const swpc = pointAt(d, "kp_3h", ms);
      const gfz = pointAt(d, "kp_gfz", ms);
      if (swpc !== null && gfz !== null) parts.push(`Δ ${fmtThirds(gfz[1] - swpc[1])}`);
    }
    return { id: row.id, y: row.top + 9, text: parts.join(" · ") };
  });
  return {
    x: px,
    stamp: fmtStamp(new Date(ms).toISOString(), zone.value, d.long ? {} : { date: "monthday" }),
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
      :viewBox="`0 0 ${String(W)} ${String(data.h)}`"
      @pointermove="onMove"
      @pointerleave="onLeave"
    >
      <ChartAxes
        :x-ticks="data.xTicks"
        :y-ticks="[]"
        :width="W"
        :height="data.h"
        :margin="M"
        :grid="false"
      />
      <g class="alertticks">
        <path v-for="a in data.alerts" :key="a.key" :d="`M${String(a.x)},3l4,8h-8z`">
          <title>{{ a.title }}</title>
        </path>
      </g>
      <g v-for="c in data.cycles" :key="c.era.label" class="cyclemark">
        <line :x1="c.x" :x2="c.x" :y1="M.t" :y2="data.h - M.b" />
        <text :x="c.x + 3" :y="M.t + 9 + c.tier * 11">{{ c.era.label }}</text>
      </g>
      <SpaceRow v-for="row in data.rows" :key="row.id" :row="row" :left="M.l" :right="W - M.r" />
      <line
        v-if="marker !== null"
        class="aumark"
        :x1="marker"
        :x2="marker"
        :y1="M.t"
        :y2="data.h - M.b"
      />
      <g v-if="cross !== null" class="cross">
        <line :x1="cross.x" :x2="cross.x" :y1="M.t" :y2="data.h - M.b" />
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
