<script setup lang="ts">
import type { ApiSpaceReading, ApiSpaceScales, SpaceSeries } from "@tectonic/shared";
import { computed } from "vue";
import { SPACE, useInjected } from "../lib/keys.js";
import { linePath, type Points } from "../lib/space-chart.js";
import { fmtKp, fmtValue, scaleClass, xrayClass } from "../lib/space-format.js";

/** The six summary tiles: the latest reading of each headline series over a sparkline of the window. */
const store = useInjected(SPACE);

const SW = 120;
const SH = 24;

/** A sparkline path across the tile, the series' own extent as its height; a log series plots its decades. */
function spark(points: Points, log = false): string {
  const lv = (v: number): number => (log ? Math.log10(v) : v);
  const vals = points.map((p) => lv(p[1])).filter((v) => Number.isFinite(v));
  if (points.length < 2 || vals.length < 2) return "";
  const t0 = Number(points[0]?.[0]);
  const t1 = Number(points[points.length - 1]?.[0]);
  const lo = Math.min(...vals);
  const span = Math.max(Math.max(...vals) - lo, 1e-9);
  const x = (ms: number): number => ((ms - t0) / (t1 - t0)) * SW;
  const y = (v: number): number => SH - 2 - ((lv(v) - lo) / span) * (SH - 4);
  return linePath(points, x, y, Number.POSITIVE_INFINITY);
}

interface Chip {
  label: string;
  cls: string;
}
interface Tile {
  id: string;
  k: string;
  /** The headline value; an em dash when the series has no reading. */
  v: string;
  small: string;
  s: string;
  spark: string;
  chips: Chip[];
}

const DASH = "—";

function series(id: SpaceSeries): Points {
  return store.window.value?.samples[id] ?? [];
}
const srcOf = (r: ApiSpaceReading): string => ` · ${r.source}`;

/** The scales tile's text: today's observed levels as chips and tomorrow's outlook as a line. */
function scalesTile(scales: ApiSpaceScales[]): Tile {
  const observed = scales.filter((r) => r.kind === "observed").at(-1);
  const obsDay = observed === undefined ? "" : observed.day;
  const tomorrow = scales.find((r) => r.kind === "predicted" && r.day > obsDay);
  const chips: Chip[] =
    observed === undefined
      ? []
      : [
          { label: `G${String(observed.g ?? "?")}`, cls: scaleClass(observed.g) },
          { label: `R${String(observed.r ?? "?")}`, cls: scaleClass(observed.r) },
          { label: `S${String(observed.s ?? "?")}`, cls: scaleClass(observed.s) },
        ];
  const pct = (p: number | null): string => (p === null ? DASH : `${String(p)}%`);
  const s =
    tomorrow === undefined
      ? "no forecast yet"
      : `D+1 G${String(tomorrow.g ?? "?")} · R1+ ${pct(tomorrow.rMinorProb)} · S1+ ${pct(tomorrow.sProb)}`;
  return {
    id: "scales",
    k: "NOAA scales",
    v: chips.length === 0 ? DASH : "",
    small: "",
    s,
    spark: "",
    chips,
  };
}

const tiles = computed<Tile[]>(() => {
  const n = store.now.value;
  const latest = n?.latest;
  const kp = latest?.kp_1m ?? null;
  const kp3 = latest?.kp_3h ?? null;
  const bz = latest?.bz_gsm ?? null;
  const bt = latest?.bt ?? null;
  const speed = latest?.speed ?? null;
  const density = latest?.density ?? null;
  const xray = latest?.xray_long ?? null;
  const p10 = latest?.p10 ?? null;
  const p100 = latest?.p100 ?? null;
  return [
    {
      id: "kp",
      k: "Kp",
      v: kp === null ? DASH : fmtValue(kp.value, 2),
      small: "1-min estimate",
      s: kp3 === null ? "no 3-hour value yet" : `3-hour Kp ${fmtKp(kp3.value)}`,
      spark: spark(series("kp_1m")),
      chips: [],
    },
    scalesTile(n?.scales ?? []),
    {
      id: "mag",
      k: "Bz · Bt (GSM)",
      v: bz === null ? DASH : fmtValue(bz.value, 1),
      small: "nT",
      s: bt === null ? "no field reading" : `Bt ${fmtValue(bt.value, 1)} nT${srcOf(bt)}`,
      spark: spark(series("bz_gsm")),
      chips: [],
    },
    {
      id: "wind",
      k: "Speed · density",
      v: speed === null ? DASH : String(Math.round(speed.value)),
      small: "km/s",
      s:
        density === null
          ? "no plasma reading"
          : `${fmtValue(density.value, 1)} /cm³${srcOf(density)}`,
      spark: spark(series("speed")),
      chips: [],
    },
    {
      id: "xray",
      k: "X-ray 0.1–0.8 nm",
      v: xray === null ? DASH : xrayClass(xray.value),
      small: "GOES class",
      s: xray === null ? "no flux reading" : `${xray.value.toExponential(1)} W/m²${srcOf(xray)}`,
      spark: spark(series("xray_long"), true),
      chips: [],
    },
    {
      id: "protons",
      k: "Protons ≥10 MeV",
      v: p10 === null ? DASH : fmtValue(p10.value, 2),
      small: "pfu",
      s:
        p100 === null
          ? "no proton reading"
          : `≥100 MeV ${fmtValue(p100.value, 2)} pfu${srcOf(p100)}`,
      spark: spark(series("p10"), true),
      chips: [],
    },
  ];
});
</script>

<template>
  <section class="stats space" aria-label="Space weather summary">
    <div v-for="t in tiles" :key="t.id" class="stat" :class="t.id">
      <div class="k">{{ t.k }}</div>
      <div class="v num">
        <template v-if="t.chips.length > 0">
          <span v-for="c in t.chips" :key="c.label" class="sc" :class="c.cls">{{ c.label }}</span>
        </template>
        <template v-else
          >{{ t.v }}<small v-if="t.v !== '—'">{{ t.small }}</small></template
        >
      </div>
      <svg v-if="t.spark !== ''" class="spark" :viewBox="`0 0 ${String(SW)} ${String(SH)}`">
        <path :d="t.spark" />
      </svg>
      <div class="s">{{ t.s }}</div>
    </div>
  </section>
</template>
