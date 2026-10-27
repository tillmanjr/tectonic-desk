<script setup lang="ts">
import { SUN_CREDIT, SUN_FRAMES, sunFrame, type SunKey } from "@tectonic/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { fmtStamp } from "../lib/format.js";
import { API, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { stepKey } from "../lib/sun-frames.js";

/**
 * One Sun frame large over the page: the 1024 px image, what it shows, its time and credit, and
 * a filmstrip of the seven. Escape, the × or a click on the backdrop close it; ← → step.
 */
const props = defineProps<{ open: SunKey | null }>();
const emit = defineEmits<{ "update:open": [key: SunKey | null] }>();
const api = useInjected(API);
const store = useInjected(SPACE);
const zone = useInjected(ZONE);

const timeOf = (key: SunKey): string | null =>
  store.sun.value?.frames.find((f) => f.key === key)?.time ?? null;

const current = computed(() => {
  if (props.open === null) return null;
  const f = sunFrame(props.open);
  const time = timeOf(f.key);
  return {
    key: f.key,
    title: f.title,
    note: f.note,
    src: api.sunImageUrl(f.key, 1024, time),
    stamp: time === null ? "time unknown" : fmtStamp(time, zone.value),
    credit: SUN_CREDIT[f.source],
  };
});

const strip = computed(() =>
  SUN_FRAMES.map((f) => ({
    key: f.key,
    title: f.title,
    src: api.sunImageUrl(f.key, 512, timeOf(f.key)),
  })),
);

function close(): void {
  emit("update:open", null);
}

/** The frame last shown, which the keys step from after the prop has moved on. */
let shown: SunKey = "aia193";

function step(delta: number): void {
  emit("update:open", stepKey(shown, delta));
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape") close();
  else if (ev.key === "ArrowLeft") step(-1);
  else if (ev.key === "ArrowRight") step(1);
  else return;
  ev.preventDefault();
}

const closeEl = ref<HTMLButtonElement | null>(null);
let held = false;

function acquire(): void {
  held = true;
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKey);
  void nextTick(() => closeEl.value?.focus());
}
function release(): void {
  held = false;
  document.body.style.overflow = "";
  window.removeEventListener("keydown", onKey);
}

watch(
  () => props.open,
  (open) => {
    if (open !== null) {
      shown = open;
      if (!held) acquire();
    } else if (held) {
      release();
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  if (held) release();
});
</script>

<template>
  <div v-if="current !== null" class="sunoverlay" @click.self="close">
    <div class="sunbox" role="dialog" aria-modal="true" :aria-label="current.title">
      <button ref="closeEl" type="button" class="sunclose" aria-label="Close" @click="close">
        ×
      </button>
      <button type="button" class="sunarrow prev" aria-label="Previous frame" @click="step(-1)">
        ‹
      </button>
      <img
        class="sunlarge"
        :src="current.src"
        :alt="`${current.title}, ${current.stamp}`"
        width="1024"
        height="1024"
      />
      <button type="button" class="sunarrow next" aria-label="Next frame" @click="step(1)">
        ›
      </button>
      <p class="suncap">
        <b>{{ current.title }}</b> · {{ current.note }}
      </p>
      <p class="suncap muted">{{ current.stamp }} · {{ current.credit }}</p>
      <div class="sunfilm">
        <button
          v-for="f in strip"
          :key="f.key"
          type="button"
          class="sunfilmthumb"
          :class="{ on: f.key === current.key }"
          :aria-pressed="f.key === current.key"
          :title="f.title"
          @click="emit('update:open', f.key)"
        >
          <img :src="f.src" :alt="f.title" />
        </button>
      </div>
    </div>
  </div>
</template>
