<script setup lang="ts">
import { SUN_FRAMES, type SunKey } from "@tectonic/shared";
import { computed } from "vue";
import { fmtClock } from "../lib/format.js";
import { API, SPACE, useInjected, ZONE } from "../lib/keys.js";

/**
 * The latest Sun: seven thumbnails from SDO and SOHO under the tiles, each with its channel and
 * the frame's time; a click asks the page to open it large.
 */
const emit = defineEmits<{ open: [key: SunKey] }>();
const api = useInjected(API);
const store = useInjected(SPACE);
const zone = useInjected(ZONE);

const thumbs = computed(() => {
  const sun = store.sun.value;
  if (sun === null) return null;
  const times = new Map(sun.frames.map((f) => [f.key, f.time]));
  return SUN_FRAMES.map((f) => {
    const time = times.get(f.key) ?? null;
    return {
      key: f.key,
      title: f.title,
      note: f.note,
      src: api.sunImageUrl(f.key, 512, time),
      when: time === null ? "time unknown" : fmtClock(time, zone.value),
    };
  });
});
</script>

<template>
  <p class="sectionlabel">The Sun · SDO and SOHO</p>
  <section class="sunstrip" aria-label="Latest Sun frames">
    <p v-if="thumbs === null" class="note">No frames yet.</p>
    <button
      v-for="t in thumbs ?? []"
      :key="t.key"
      type="button"
      class="sunthumb"
      :title="t.note"
      @click="emit('open', t.key)"
    >
      <img :src="t.src" :alt="`${t.title}, ${t.when}`" loading="lazy" width="512" height="512" />
      <span class="t">{{ t.title }}</span>
      <span class="m">{{ t.when }}</span>
    </button>
  </section>
</template>
