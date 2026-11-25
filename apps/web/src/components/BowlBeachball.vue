<script setup lang="ts">
import type { MechanismGeometry } from "@tectonic/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { bowlScene, drawBowl } from "../lib/beachball.js";
import { BOWL_HOLD_MS, BOWL_MAX_TILT, BOWL_SETTLE_MS, BOWL_TILT, settleTilt } from "../lib/bowl.js";
import { cssVar } from "../lib/colors.js";
import { depthVar } from "../lib/depth.js";
import { vHint } from "../lib/hint.js";
import { THEME, useInjected } from "../lib/keys.js";

/**
 * The event panel's beachball as the inside of the focal sphere (Settings → Beachball: Bowl). It
 * opens tilted `BOWL_TILT` from the south, holds, and settles to 0°, the equal-area plot; the
 * slider tilts it again either way and ↻ replays the settle. Reduced motion opens it at 0°.
 */
const props = withDefaults(
  defineProps<{ mechanism: MechanismGeometry; px: number; depthKm: number | null; alt?: string }>(),
  { alt: "" },
);
const theme = useInjected(THEME);
const canvas = ref<HTMLCanvasElement | null>(null);
// The theme is read so a switch re-reads the colours.
const colors = computed(() => ({
  theme: theme.resolved.value,
  fill: cssVar(depthVar(props.depthKm)),
  tension: cssVar("--tension"),
  ink: cssVar("--ink"),
  under: cssVar("--border"),
}));
const scene = computed(() => bowlScene(props.mechanism, props.px, colors.value));
const still = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tilt = ref(still() ? 0 : BOWL_TILT);
const shown = computed(() => Math.round(tilt.value));
const label = computed(() => `${shown.value < 0 ? "−" : ""}${String(Math.abs(shown.value))}°`);

function draw(): void {
  const s = scene.value;
  const g = canvas.value?.getContext("2d") ?? null;
  if (s === null || g === null) return;
  drawBowl(g, s, tilt.value);
}

let frame = 0;
function stop(): void {
  cancelAnimationFrame(frame);
  frame = 0;
}
function settle(): void {
  stop();
  if (still()) {
    tilt.value = 0;
    return;
  }
  tilt.value = BOWL_TILT;
  let start: number | null = null;
  const step = (now: number): void => {
    start ??= now;
    const elapsed = now - start;
    tilt.value = settleTilt(elapsed);
    frame = elapsed < BOWL_HOLD_MS + BOWL_SETTLE_MS ? requestAnimationFrame(step) : 0;
  };
  frame = requestAnimationFrame(step);
}
/** The slider: moving it stops the settle and holds the tilt where the reader puts it. */
const slider = computed({
  get: () => shown.value,
  set: (deg: number) => {
    stop();
    tilt.value = deg;
  },
});

watch([scene, tilt], draw, { flush: "post" });
// A refreshed record of the same solution keeps its tilt; a different solution settles afresh.
const geometry = computed(() => {
  const m = props.mechanism;
  return [m.strike1, m.dip1, m.rake1, m.tAzimuth, m.tPlunge, m.pAzimuth, m.pPlunge].join("|");
});
watch(geometry, settle);
onMounted(() => {
  draw();
  settle();
});
onUnmounted(stop);
</script>

<template>
  <div v-if="scene !== null" class="bowlball" data-tour="mech.ball">
    <canvas ref="canvas" :width="px * 2" :height="px * 2" role="img" :aria-label="alt"></canvas>
    <div class="tiltrow">
      <input
        v-model.number="slider"
        v-hint="
          'Tilts the bowl: positive looks from the south, negative from the north; at 0° it is the equal-area plot'
        "
        type="range"
        :min="-BOWL_MAX_TILT"
        :max="BOWL_MAX_TILT"
        step="1"
        aria-label="Tilt of the bowl"
      />
      <output>{{ label }}</output>
      <button
        v-hint="'Replays the opening tilt'"
        type="button"
        aria-label="Replay the tilt"
        @click="settle"
      >
        ↻
      </button>
    </div>
  </div>
</template>
