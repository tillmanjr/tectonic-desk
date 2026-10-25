<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { capturePointer } from "../lib/dom.js";
import { pathOf, type MapFrame } from "../lib/geo.js";
import { corridorRing, linePoints, type Section } from "../lib/section.js";

/**
 * The section line on the map: the corridor band, the great-circle line, draggable end handles
 * labelled A and A′, and while placing, the rubber line from the first point to the pointer.
 */
const props = defineProps<{
  frame: MapFrame;
  path: GeoPath;
  k: number;
  section: Section | null;
  pending: [number, number] | null;
  cursor: [number, number] | null;
}>();
const emit = defineEmits<{
  dragStart: [end: "a" | "b"];
  dragMove: [ev: PointerEvent];
  dragEnd: [];
}>();

const HANDLE_R = 7;
const corridor = computed(() =>
  props.section === null
    ? ""
    : pathOf(props.path, { type: "Polygon", coordinates: [corridorRing(props.section)] }),
);
const line = computed(() =>
  props.section === null
    ? ""
    : pathOf(props.path, { type: "LineString", coordinates: linePoints(props.section) }),
);
const rubber = computed(() =>
  props.pending === null || props.cursor === null
    ? ""
    : pathOf(props.path, { type: "LineString", coordinates: [props.pending, props.cursor] }),
);
interface Handle {
  end: "a" | "b";
  label: string;
  x: number;
  y: number;
}
const handles = computed<Handle[]>(() => {
  const s = props.section;
  const ends: { end: "a" | "b"; label: string; at: [number, number] }[] =
    s === null
      ? props.pending === null
        ? []
        : [{ end: "a", label: "A", at: props.pending }]
      : [
          { end: "a", label: "A", at: s.a },
          { end: "b", label: "A′", at: s.b },
        ];
  const out: Handle[] = [];
  for (const h of ends) {
    const p = props.frame.projection(h.at);
    if (p !== null) out.push({ end: h.end, label: h.label, x: p[0], y: p[1] });
  }
  return out;
});

function down(ev: PointerEvent, end: "a" | "b"): void {
  if (props.section === null) return;
  capturePointer(ev);
  emit("dragStart", end);
}
</script>

<template>
  <g class="section" data-hit data-layer="section">
    <path v-if="corridor !== ''" class="corridor" :d="corridor" />
    <path v-if="line !== ''" class="sline" :d="line" :stroke-width="2 / k" />
    <path v-if="rubber !== ''" class="sline rubber" :d="rubber" :stroke-width="1.5 / k" />
    <g v-for="h in handles" :key="h.end" class="shandle">
      <circle
        class="handle"
        :cx="h.x"
        :cy="h.y"
        :r="HANDLE_R / k"
        :stroke-width="2 / k"
        @pointerdown.stop.prevent="down($event, h.end)"
        @pointermove="emit('dragMove', $event)"
        @pointerup="emit('dragEnd')"
        @pointercancel="emit('dragEnd')"
      />
      <text
        class="slabel"
        :x="h.x + (HANDLE_R + 3) / k"
        :y="h.y - (HANDLE_R + 1) / k"
        :font-size="12 / k"
      >
        {{ h.label }}
      </text>
    </g>
  </g>
</template>
