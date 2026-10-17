<script setup lang="ts">
import type { Volcano } from "@tectonic/shared";
import { computed } from "vue";
import type { MapFrame } from "../lib/geo.js";
import { ERUPTION_CLASSES, eruptionClass } from "../lib/volcanoes.js";

/** Base half-width of the triangle marker in viewBox units at zoom 1. */
const BASE = 5;

interface Mark {
  v: Volcano;
  x: number;
  y: number;
  s: number;
  fill: string;
  ring: string | null;
  plume: boolean;
}

const props = withDefaults(
  defineProps<{
    frame: MapFrame;
    volcanoes: Volcano[];
    k: number;
    selected: number | null;
    /** The ring colour for a volcano whose agency status is above normal; null draws no ring. */
    ringOf: (number: number) => string | null;
    continuing: Set<number>;
    /** Floor on the marker size in viewBox units at zoom 1, for fingers. */
    minRadius?: number;
  }>(),
  { minRadius: 0 },
);
const emit = defineEmits<{
  select: [number: number];
  hover: [payload: { v: Volcano; x: number; y: number }];
  leave: [];
}>();

const marks = computed<Mark[]>(() => {
  const s = Math.max(BASE / props.k ** 0.75, props.minRadius / props.k);
  return props.volcanoes
    .flatMap((v): Mark[] => {
      const p = props.frame.projection([v.lon, v.lat]);
      if (p === null) return [];
      return [
        {
          v,
          x: p[0],
          y: p[1],
          s,
          fill: ERUPTION_CLASSES[eruptionClass(v.lastEruptionYear)].color,
          ring: props.ringOf(v.number),
          plume: props.continuing.has(v.number),
        },
      ];
    })
    .sort((a, b) => Number(a.ring !== null) - Number(b.ring !== null));
});

const triangle = (m: Mark): string =>
  `M${String(m.x)},${String(m.y - m.s)}L${String(m.x + 0.9 * m.s)},${String(m.y + 0.6 * m.s)}L${String(m.x - 0.9 * m.s)},${String(m.y + 0.6 * m.s)}Z`;

function hover(ev: MouseEvent, v: Volcano): void {
  emit("hover", { v, x: ev.clientX, y: ev.clientY });
}
</script>

<template>
  <g data-hit>
    <g
      v-for="m in marks"
      :key="m.v.number"
      class="volc"
      :class="{ sel: m.v.number === selected }"
      :data-number="m.v.number"
      style="cursor: pointer"
      @click.stop="emit('select', m.v.number)"
      @mouseenter="hover($event, m.v)"
      @mouseleave="emit('leave')"
    >
      <circle
        v-if="m.ring !== null"
        class="ring"
        :cx="m.x"
        :cy="m.y"
        :r="m.s * 1.7"
        fill="none"
        :style="{ stroke: m.ring }"
        stroke-width="2.2"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="triangle(m)"
        :style="{ fill: m.fill, stroke: m.v.number === selected ? 'var(--accent)' : 'var(--ink)' }"
        fill-opacity="0.9"
        :stroke-width="m.v.number === selected ? 2.2 : 0.7"
        stroke-opacity="0.8"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-if="m.plume"
        class="plume"
        :cx="m.x"
        :cy="m.y - m.s * 1.8"
        :r="m.s * 0.4"
        style="fill: var(--vc-recent); stroke: var(--ink)"
        stroke-width="0.6"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
