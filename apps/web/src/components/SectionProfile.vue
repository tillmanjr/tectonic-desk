<script setup lang="ts">
import { scaleLinear } from "d3-scale";
import { computed, ref } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf, type Tick } from "../lib/charts.js";
import { depthColor } from "../lib/depth.js";
import { fmtMag, placeOf } from "../lib/format.js";
import {
  CATALOG,
  SECTION,
  SELECT,
  SELECT_VOLCANO,
  SET_SECTION,
  useInjected,
  VOLCANOES,
} from "../lib/keys.js";
import {
  azimuth,
  azimuthText,
  HALF_KM_RANGE,
  lengthKm,
  profileOf,
  surfacePointsOf,
  type ProfilePoint,
  type SurfacePoint,
} from "../lib/section.js";
import { useSectionTool } from "../lib/section-tool.js";

/**
 * Depth against distance along the section line, at a chosen vertical exaggeration, for the
 * corridor's events; on Active Earth also the corridor's volcanoes at the surface.
 */
const props = withDefaults(defineProps<{ volcanoes?: boolean }>(), { volcanoes: false });
const catalog = useInjected(CATALOG);
const store = useInjected(VOLCANOES);
const section = useInjected(SECTION);
const setSection = useInjected(SET_SECTION);
const select = useInjected(SELECT);
const selectVolcano = useInjected(SELECT_VOLCANO);
const tool = useSectionTool(section, setSection);

const W = 900;
/** The top margin leaves room for two rows of volcano names above the surface. */
const M = { l: 44, r: 16, t: 40, b: 26 };
/** The tallest plot allowed; deeper events are counted rather than squashed. */
const MAX_PLOT = 480 - M.t - M.b;
const MIN_PLOT = 140 - M.t - M.b;
const VE_CHOICES = [1, 2, 4] as const;
type Ve = (typeof VE_CHOICES)[number];
const ve = ref<Ve>(1);
const isVe = (n: number): n is Ve => VE_CHOICES.some((v) => v === n);

interface Mark {
  p: ProfilePoint;
  x: number;
  y: number;
  r: number;
  title: string;
}
interface Surface {
  s: SurfacePoint;
  x: number;
  /** Name row: neighbours alternate so close volcanoes do not overprint. */
  row: 0 | 1;
}
interface Data {
  title: string;
  H: number;
  marks: Mark[];
  surface: Surface[];
  xTicks: Tick[];
  yTicks: Tick[];
  caption: string;
  empty: boolean;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;
/** Deepest value rounded up to a 10 km step, at least 20 km. */
const axisFor = (deepest: number): number => Math.max(20, Math.ceil(deepest / 10) * 10);

const data = computed<Data | null>(() => {
  const s = section.value;
  if (s === null) return null;
  const length = lengthKm(s);
  const profile = profileOf(s, catalog.filtered.value);
  const plotW = W - M.l - M.r;
  const kmPerPx = length / plotW;
  const deepest = profile.points.reduce((m, p) => Math.max(m, p.depthKm), 0);
  const fits = (MAX_PLOT * kmPerPx) / ve.value;
  const axisKm = Math.min(axisFor(deepest), fits);
  const plotH = Math.max(MIN_PLOT, (axisKm / kmPerPx) * ve.value);
  const H = Math.round(plotH + M.t + M.b);
  const x = scaleLinear([0, length], [M.l, W - M.r]);
  const y = (depth: number): number => M.t + (depth / kmPerPx) * ve.value;
  const floor = catalog.floor.value;
  const marks: Mark[] = [];
  let tooDeep = 0;
  for (const p of profile.points) {
    if (p.depthKm > axisKm) {
      tooDeep++;
      continue;
    }
    const e = p.event;
    marks.push({
      p,
      x: x(p.alongKm),
      y: y(p.depthKm),
      r: 2 + Math.max(0, (p.mag ?? floor) - floor) * 1.2,
      title: `M${fmtMag(e.mag)} · ${placeOf(e)} · ${String(Math.round(p.depthKm))} km`,
    });
  }
  const surface: Surface[] = props.volcanoes
    ? surfacePointsOf(s, store.inRegion.value).map((sp, i) => ({
        s: sp,
        x: x(sp.alongKm),
        row: i % 2 === 0 ? 0 : 1,
      }))
    : [];
  const yScale = scaleLinear([0, axisKm], [M.t, M.t + plotH]);
  const notes = [
    `Depth against distance along A–A′ at ×${String(ve.value)}${ve.value === 1 ? " (true scale)" : ""}; events within ±${String(s.halfKm)} km of the line, projected onto it; colour by depth class, size by magnitude.`,
  ];
  if (tooDeep > 0) {
    notes.push(`${String(tooDeep)} deeper than ${String(Math.round(axisKm))} km not shown.`);
  }
  if (profile.noDepth > 0) {
    notes.push(`${String(profile.noDepth)} without a reported depth not shown.`);
  }
  const empty = profile.points.length === 0;
  return {
    title: `Section A–A′ · ${azimuthText(azimuth(s))} · ${String(Math.round(length))} km · ${plural(profile.points.length, "event", "events")}`,
    H,
    marks,
    surface,
    xTicks: ticksOf(x, 6),
    yTicks: ticksOf(yScale, 5),
    caption: empty
      ? `No events with a depth within ±${String(s.halfKm)} km of the line.`
      : notes.join(" "),
    empty,
  };
});

const halfEl = ref<HTMLInputElement | null>(null);
function changeHalf(): void {
  const raw = String(halfEl.value?.value);
  const v = Number(raw);
  if (raw === "" || !Number.isFinite(v)) return;
  tool.setHalfKm(v);
}
const veEl = ref<HTMLSelectElement | null>(null);
function changeVe(): void {
  const v = Number(veEl.value?.value);
  if (isVe(v)) ve.value = v;
}
const selectedId = catalog.selectedId;
</script>

<template>
  <div v-if="data !== null && section !== null" class="panel chart sectionpanel">
    <h2 class="withfilter">
      <span class="stitle">{{ data.title }}</span>
      <span class="sctl">
        <label
          >corridor ±
          <input
            ref="halfEl"
            type="number"
            :min="HALF_KM_RANGE[0]"
            :max="HALF_KM_RANGE[1]"
            step="5"
            :value="section.halfKm"
            aria-label="Corridor half-width in km"
            @change="changeHalf"
          />
          km</label
        >
        <label
          >vertical ×
          <select
            ref="veEl"
            :value="String(ve)"
            aria-label="Vertical exaggeration"
            @change="changeVe"
          >
            <option v-for="v in VE_CHOICES" :key="v" :value="String(v)">{{ v }}</option>
          </select></label
        >
        <button type="button" class="sclear" @click="tool.clear()">Clear</button>
      </span>
    </h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(data.H)}`" class="sectionsvg">
      <ChartAxes
        :x-ticks="data.xTicks"
        :y-ticks="data.yTicks"
        :width="W"
        :height="data.H"
        :margin="M"
      />
      <line class="surfaceline" :x1="M.l" :x2="W - M.r" :y1="M.t" :y2="M.t" />
      <text class="endlabel" :x="M.l + 2" :y="M.t - 26">A</text>
      <text class="endlabel" :x="W - M.r - 2" :y="M.t - 26" text-anchor="end">A′</text>
      <g
        v-for="v in data.surface"
        :key="v.s.number"
        class="volc"
        tabindex="0"
        role="button"
        :aria-label="v.s.name"
        @click="selectVolcano(v.s.number)"
        @keydown.enter="selectVolcano(v.s.number)"
      >
        <path
          :d="`M${String(v.x)},${String(M.t - 9)}L${String(v.x + 5)},${String(M.t)}L${String(v.x - 5)},${String(M.t)}Z`"
        />
        <text :x="v.x" :y="M.t - 12 - v.row * 11" text-anchor="middle">{{ v.s.name }}</text>
      </g>
      <g
        v-for="m in data.marks"
        :key="m.p.id"
        class="hypo"
        :class="{ sel: m.p.id === selectedId }"
        tabindex="0"
        role="button"
        :aria-label="m.title"
        @click="select(m.p.id)"
        @keydown.enter="select(m.p.id)"
      >
        <circle v-if="m.p.id === selectedId" class="ring" :cx="m.x" :cy="m.y" :r="m.r + 3" />
        <circle :cx="m.x" :cy="m.y" :r="m.r" :style="{ fill: depthColor(m.p.depthKm) }">
          <title>{{ m.title }}</title>
        </circle>
      </g>
    </svg>
    <p class="cap" :class="{ note: data.empty }">{{ data.caption }}</p>
  </div>
</template>
