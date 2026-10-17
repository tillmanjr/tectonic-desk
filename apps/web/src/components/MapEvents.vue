<script setup lang="ts">
import type { ApiEvent, ApiMechanism } from "@tectonic/shared";
import { computed } from "vue";
import { beachballUrl } from "../lib/beachball.js";
import { cssVar } from "../lib/colors.js";
import { depthColor, depthVar } from "../lib/depth.js";
import type { MapFrame } from "../lib/geo.js";
import { THEME, useInjected } from "../lib/keys.js";
import { beachballSize, markerRadius, ZOOM_SHRINK } from "../lib/markers.js";
import { preferredMechanism } from "../lib/stats.js";

interface Point {
  e: ApiEvent;
  x: number;
  y: number;
  mech: ApiMechanism | null;
  r: number;
  size: number;
}
interface Ball extends Point {
  mech: ApiMechanism;
}

const props = withDefaults(
  defineProps<{
    frame: MapFrame;
    events: ApiEvent[];
    k: number;
    selectedId: string | null;
    showMech: boolean;
    minMag: number;
    /** Floor on the drawn radius in viewBox units at zoom 1, for finger-sized targets; 0 for none. */
    minRadius?: number;
  }>(),
  { minRadius: 0 },
);
const emit = defineEmits<{
  select: [id: string];
  hover: [payload: { e: ApiEvent; x: number; y: number }];
  leave: [];
}>();

const theme = useInjected(THEME);
const inks = computed(() => ({
  theme: theme.resolved.value,
  tension: cssVar("--tension"),
  ink: cssVar("--ink"),
}));
const magOf = (e: ApiEvent): number => e.mag ?? props.minMag;

const points = computed<Point[]>(() =>
  [...props.events]
    .sort((a, b) => magOf(a) - magOf(b))
    .flatMap((e) => {
      const p = props.frame.projection([e.longitude, e.latitude]);
      if (p === null) return [];
      const m = magOf(e);
      return [
        {
          e,
          x: p[0],
          y: p[1],
          mech: preferredMechanism(e),
          r: markerRadius(m, props.minMag, props.frame.global),
          size: beachballSize(m, props.frame.global),
        },
      ];
    }),
);
const scale = computed(() => props.k ** ZOOM_SHRINK);
/** Markers shrink with zoom (`ZOOM_SHRINK`) but never below the tappable floor, which shrinks with k outright. */
const radiusOf = (p: Point): number => Math.max(p.r / scale.value, props.minRadius / props.k);
const sizeOf = (p: Point): number =>
  Math.max(p.size / scale.value, (2 * props.minRadius) / props.k);
const circles = computed(() => points.value.filter((p) => !(props.showMech && p.mech !== null)));
const balls = computed<Ball[]>(() =>
  props.showMech
    ? points.value.flatMap((p) => (p.mech === null ? [] : [{ ...p, mech: p.mech }]))
    : [],
);

function href(b: Ball): string {
  const { tension, ink } = inks.value;
  return beachballUrl(b.mech, 64, { fill: cssVar(depthVar(b.e.depthKm)), tension, ink }, false);
}
function hover(ev: MouseEvent, e: ApiEvent): void {
  emit("hover", { e, x: ev.clientX, y: ev.clientY });
}
</script>

<template>
  <g data-hit data-layer="events">
    <circle
      v-for="p in circles"
      :key="p.e.id"
      :cx="p.x"
      :cy="p.y"
      :r="radiusOf(p) * (p.e.id === selectedId ? 1.25 : 1)"
      :style="{
        fill: depthColor(p.e.depthKm),
        stroke: p.e.id === selectedId ? 'var(--ink)' : depthColor(p.e.depthKm),
        cursor: 'pointer',
      }"
      fill-opacity="0.45"
      stroke-opacity="0.95"
      :stroke-width="p.e.id === selectedId ? 2.2 : 1.1"
      vector-effect="non-scaling-stroke"
      @click.stop="emit('select', p.e.id)"
      @mouseenter="hover($event, p.e)"
      @mouseleave="emit('leave')"
    />
    <g
      v-for="b in balls"
      :key="b.e.id"
      class="bb"
      style="cursor: pointer"
      @click.stop="emit('select', b.e.id)"
      @mouseenter="hover($event, b.e)"
      @mouseleave="emit('leave')"
    >
      <image
        :href="href(b)"
        :x="b.x - sizeOf(b) / 2"
        :y="b.y - sizeOf(b) / 2"
        :width="sizeOf(b)"
        :height="sizeOf(b)"
      />
      <circle
        v-if="b.e.id === selectedId"
        class="ring"
        :cx="b.x"
        :cy="b.y"
        :r="sizeOf(b) / 2 + 2 / k"
        fill="none"
        style="stroke: var(--accent)"
        stroke-width="2.5"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
