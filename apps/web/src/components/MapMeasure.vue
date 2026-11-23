<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { capturePointer } from "../lib/dom.js";
import { pathOf, projectPoint, type MapFrame } from "../lib/geo.js";
import { linePoints, pointAlong, type Section } from "../lib/section.js";

/**
 * The measurement on the map: a dashed great-circle line in ink with a halo, diamond handles,
 * and its two-line reading at the midpoint, all at constant screen size. Unlike the section,
 * it has no corridor, no A/A′ labels and no colour of its own. While placing, the line runs
 * from the first point to the pointer and reads as it goes.
 */
const props = defineProps<{
  frame: MapFrame;
  path: GeoPath;
  k: number;
  line: Section | null;
  pending: [number, number] | null;
  cursor: [number, number] | null;
  lines: [string, string] | null;
}>();
const emit = defineEmits<{
  dragStart: [end: "a" | "b"];
  dragMove: [ev: PointerEvent];
  dragEnd: [];
}>();

/** Half the diagonal of a handle, in screen pixels. */
const HANDLE = 6;
/** Radius, in screen pixels, of the transparent disc that takes a press on a handle. */
const HIT_R = 16;
/** The line drawn: the placed one, else the one from the first point to the pointer. */
const drawn = computed<Section | null>(() => {
  if (props.line !== null) return props.line;
  const { pending, cursor } = props;
  return pending === null || cursor === null ? null : { a: pending, b: cursor, halfKm: 0 };
});
const d = computed(() =>
  drawn.value === null
    ? ""
    : pathOf(props.path, { type: "LineString", coordinates: linePoints(drawn.value) }),
);
const at = (lonLat: [number, number]): { x: number; y: number } | null => {
  const [x, y] = projectPoint(props.frame.projection, lonLat);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
interface Handle {
  end: "a" | "b";
  x: number;
  y: number;
}
const handles = computed<Handle[]>(() => {
  const ends: { end: "a" | "b"; p: [number, number] }[] = [];
  if (props.line !== null) ends.push({ end: "a", p: props.line.a }, { end: "b", p: props.line.b });
  else if (props.pending !== null) ends.push({ end: "a", p: props.pending });
  return ends.flatMap((e) => {
    const xy = at(e.p);
    return xy === null ? [] : [{ end: e.end, ...xy }];
  });
});
/** How far above the line the label's box starts, in screen pixels. */
const LABEL_LIFT = 48;
/** Width of one character of the label's monospaced 12 px face, for its backing box. */
const CHAR_PX = 7.3;
const label = computed(() => {
  if (drawn.value === null || props.lines === null) return null;
  const xy = at(pointAlong(drawn.value, 0.5));
  if (xy === null) return null;
  const width = Math.max(...props.lines.map((l) => l.length)) * CHAR_PX + 14;
  // Above the line, unless that would run off the top of the map.
  const top = xy.y - LABEL_LIFT / props.k < 0 ? 10 : -LABEL_LIFT;
  return { ...xy, width, top };
});

function down(ev: PointerEvent, end: "a" | "b"): void {
  capturePointer(ev);
  emit("dragStart", end);
}
</script>

<template>
  <g class="measure" data-hit data-layer="measure">
    <template v-if="d !== ''">
      <path class="mhalo" :d="d" :stroke-width="5 / k" />
      <path
        class="mline"
        :class="{ placing: line === null }"
        :d="d"
        :stroke-width="2 / k"
        :stroke-dasharray="`${String(8 / k)} ${String(4 / k)}`"
      />
    </template>
    <g
      v-for="h in handles"
      :key="h.end"
      class="mhandle"
      :transform="`translate(${String(h.x)},${String(h.y)}) scale(${String(1 / k)})`"
    >
      <rect
        class="mdiamond"
        :x="-HANDLE / Math.SQRT2"
        :y="-HANDLE / Math.SQRT2"
        :width="HANDLE * Math.SQRT2"
        :height="HANDLE * Math.SQRT2"
        transform="rotate(45)"
      />
      <circle
        class="mhit"
        :r="HIT_R"
        @pointerdown.stop.prevent="down($event, h.end)"
        @pointermove="emit('dragMove', $event)"
        @pointerup="emit('dragEnd')"
        @pointercancel="emit('dragEnd')"
        @touchstart.stop.prevent
      />
    </g>
    <g
      v-if="label !== null && lines !== null"
      :transform="`translate(${String(label.x)},${String(label.y)}) scale(${String(1 / k)})`"
    >
      <rect
        class="mlabelbox"
        :x="-label.width / 2"
        :y="label.top"
        :width="label.width"
        height="38"
        rx="4"
      />
      <text class="mlabel" text-anchor="middle">
        <tspan x="0" :y="label.top + 16">{{ lines[0] }}</tspan>
        <tspan x="0" :y="label.top + 31">{{ lines[1] }}</tspan>
      </text>
    </g>
  </g>
</template>
