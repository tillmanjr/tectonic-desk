<script setup lang="ts">
import type { ApiSpaceReading } from "@tectonic/shared";
import { computed } from "vue";
import { ago, fmtClock } from "../lib/format.js";
import { CLOCK, SPACE, useInjected, ZONE } from "../lib/keys.js";

/** The status line of the Space page: how fresh the newest sample is and which instruments feed it. */
const STALE_MS = 15 * 60_000;
const store = useInjected(SPACE);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);

const srcOf = (r: ApiSpaceReading | null): string | null => (r === null ? null : r.source);

const state = computed<{ cls: string; text: string; sources: string }>(() => {
  const err = store.error.value;
  if (err !== null) return { cls: "bad", text: `SWPC data unavailable: ${err}`, sources: "" };
  const n = store.now.value;
  if (n === null) return { cls: "", text: "Connecting to SWPC…", sources: "" };
  const times = Object.values(n.latest).flatMap((r) => (r === null ? [] : [Date.parse(r.time)]));
  if (times.length === 0) {
    return { cls: "warn", text: "Live · NOAA SWPC · no samples yet", sources: "" };
  }
  const newest = new Date(Math.max(...times)).toISOString();
  const now = clock.now.value;
  const age = now.getTime() - Date.parse(newest);
  const feeds: { label: string; src: string | null }[] = [
    { label: "mag", src: srcOf(n.latest.bt) },
    { label: "plasma", src: srcOf(n.latest.speed) },
    { label: "X-rays", src: srcOf(n.latest.xray_long) },
  ];
  const sources = feeds.flatMap((f) => (f.src === null ? [] : [`${f.label} ${f.src}`])).join(" · ");
  return {
    cls: age > STALE_MS ? "warn" : "",
    text: `Live · NOAA SWPC · newest sample ${fmtClock(newest, zone.value)} · ${ago(newest, now)} ago`,
    sources,
  };
});
</script>

<template>
  <div class="status" :class="state.cls" aria-live="polite">
    <span>{{ state.text }}</span>
    <span v-if="state.sources !== ''">{{ state.sources }}</span>
  </div>
</template>
