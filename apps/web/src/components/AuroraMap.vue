<script setup lang="ts">
import { geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { computed } from "vue";
import type { AuroraBand } from "../lib/aurora-bands.js";
import {
  MAP_SIZE,
  nightRing,
  polarGraticule,
  polarProjection,
  timeMarks,
  type Hemisphere,
  type TimeMark,
} from "../lib/aurora-map.js";
import { pathOf } from "../lib/geo.js";
import { subsolarPoint } from "../lib/sun.js";

/**
 * One polar map: land, graticule, the night side at the forecast time and the probability bands,
 * noon at the top. No pointer interaction; the caption beside the pair carries the reading.
 */
const props = defineProps<{
  hemisphere: Hemisphere;
  /** One band per threshold, weakest first. */
  bands: AuroraBand[];
  /** The instant the bands are for; it sets the Sun's position. */
  forecast: string;
  land: FeatureCollection | null;
}>();

const subsolar = computed(() => subsolarPoint(new Date(props.forecast)));
const path = computed(() => geoPath(polarProjection(props.hemisphere, subsolar.value[0])));
const sphere = computed(() => pathOf(path.value, { type: "Sphere" }));
const graticule = computed(() => pathOf(path.value, polarGraticule()));
const night = computed(() => pathOf(path.value, nightRing(subsolar.value)));
const landPath = computed(() => (props.land === null ? null : pathOf(path.value, props.land)));
const bandPaths = computed(() =>
  props.bands.map((b) => ({ level: b.level, d: pathOf(path.value, b.shape) })),
);
const title = computed(() => (props.hemisphere === "north" ? "North" : "South"));

const EDGE = 12;
const MID = MAP_SIZE / 2;
const MARK_AT: Record<TimeMark["side"], { x: number; y: number }> = {
  top: { x: MID, y: EDGE },
  bottom: { x: MID, y: MAP_SIZE - 4 },
  left: { x: EDGE, y: MID + 4 },
  right: { x: MAP_SIZE - EDGE, y: MID + 4 },
};
const marks = computed(() =>
  timeMarks(props.hemisphere).map((m) => ({ ...m, ...MARK_AT[m.side] })),
);
</script>

<template>
  <svg
    class="polar"
    :class="hemisphere"
    :viewBox="`0 0 ${String(MAP_SIZE)} ${String(MAP_SIZE)}`"
    role="img"
    :aria-label="`${title}ern hemisphere aurora probability`"
  >
    <path class="sphere" :d="sphere" />
    <path v-if="landPath !== null" class="land" :d="landPath" />
    <path class="grat" :d="graticule" />
    <path class="night" :d="night" />
    <path
      v-for="b in bandPaths"
      :key="b.level"
      class="band"
      :class="`au-${String(b.level)}`"
      :d="b.d"
    />
    <circle class="pole" :cx="MID" :cy="MID" r="1.5" />
    <text class="htitle" x="8" y="16">{{ title }}</text>
    <text v-for="m in marks" :key="m.label" class="tmark" :x="m.x" :y="m.y">{{ m.label }}</text>
  </svg>
</template>
