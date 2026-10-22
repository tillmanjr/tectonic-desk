<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { loadBasemapFor } from "../lib/basemap-cache.js";
import { API, CATALOG, useInjected } from "../lib/keys.js";
import type { MarkKind, ThumbFrame } from "../lib/marks.js";
import { outlinePath, starPath, THUMB, thumbProjection } from "../lib/thumb.js";

/** A 96 × 56 schematic of the world or the West Coast with a star at the marked event. */
const props = defineProps<{ lon: number; lat: number; frame: ThumbFrame; kind: MarkKind }>();
const api = useInjected(API);
const catalog = useInjected(CATALOG);

/** The region whose outline and bbox the frame uses: the West Coast preset, else the global one. */
const region = computed(() => {
  const rs = catalog.regions.value;
  if (props.frame === "wc") {
    const wc = rs.find((r) => r.id === "wc" && r.bbox !== null);
    if (wc !== undefined) return wc;
  }
  return rs.find((r) => r.bbox === null) ?? null;
});
const projection = computed(() => thumbProjection(props.frame, region.value?.bbox ?? null));
const star = computed(() => {
  const p = projection.value([props.lon, props.lat]);
  if (p === null || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return starPath(p[0], p[1], 5);
});
const land = shallowRef<string | null>(null);
let seq = 0;
watch(
  region,
  async (r) => {
    const token = ++seq;
    land.value = null;
    if (r === null) return;
    try {
      const b = await loadBasemapFor(api, r);
      if (token === seq) land.value = outlinePath(b, projection.value);
    } catch (e) {
      console.error("thumbnail basemap failed to load", e);
    }
  },
  { immediate: true },
);
const fill = computed(() => (props.kind === "event" ? "var(--accent)" : "var(--vc-recent)"));
</script>

<template>
  <svg
    class="thumb"
    :viewBox="`0 0 ${String(THUMB.width)} ${String(THUMB.height)}`"
    aria-hidden="true"
  >
    <path v-if="land !== null" class="land" :d="land" />
    <path v-if="star !== null" class="star" :d="star" :style="{ fill }" />
  </svg>
</template>
