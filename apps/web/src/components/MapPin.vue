<script setup lang="ts">
import { computed } from "vue";
import { capturePointer } from "../lib/dom.js";
import { projectPoint, type MapFrame } from "../lib/geo.js";

/**
 * The reader's pin: a teardrop standing on its point with a ground shadow, in
 * its own colour, so it reads apart from the section handles and every marker.
 * Constant screen size. A quick press opens the pin bar; a held press lifts it.
 */
const props = defineProps<{
  frame: MapFrame;
  k: number;
  at: [number, number];
  holding: boolean;
  lifted: boolean;
  /** The preview under the pointer while placing: no shadow, no hit target. */
  ghost?: boolean;
}>();
const emit = defineEmits<{
  hover: [ev: MouseEvent];
  leave: [];
  down: [ev: PointerEvent];
  move: [ev: PointerEvent];
  up: [];
}>();

/** The teardrop, point at the origin, 26 px tall. */
const BODY = "M0,0 C-1.5,-6 -9,-10.5 -9,-17 A9,9 0 1 1 9,-17 C9,-10.5 1.5,-6 0,0 Z";
/** How far a lifted pin rises off its point, in screen pixels. */
const LIFT_PX = 7;
const place = computed(() => {
  const [x, y] = projectPoint(props.frame.projection, props.at);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
});

function down(ev: PointerEvent): void {
  capturePointer(ev);
  emit("down", ev);
}
</script>

<template>
  <g
    v-if="place !== null"
    class="mappin"
    :class="{ holding, lifted, ghost }"
    data-hit
    data-layer="pin"
    :transform="`translate(${String(place.x)},${String(place.y)}) scale(${String(1 / k)})`"
  >
    <ellipse
      v-if="!ghost"
      class="pshadow"
      cx="0"
      cy="0"
      :rx="lifted ? 7 : 5"
      :ry="lifted ? 2.6 : 2"
    />
    <g :transform="lifted ? `translate(0,${String(-LIFT_PX)})` : undefined">
      <path class="pbody" :d="BODY" />
      <circle class="pcore" cx="0" cy="-17" r="3.6" />
      <!-- Takes the press; its touchstart stays here so d3-zoom and the page leave the gesture alone. -->
      <path
        v-if="!ghost"
        class="phit"
        :d="BODY"
        @pointerdown.stop.prevent="down"
        @pointermove="emit('move', $event)"
        @pointerup="emit('up')"
        @pointercancel="emit('up')"
        @mousemove="emit('hover', $event)"
        @mouseleave="emit('leave')"
        @click.stop
        @touchstart.stop.prevent
      />
    </g>
  </g>
</template>
