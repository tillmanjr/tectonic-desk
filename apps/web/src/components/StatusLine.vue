<script setup lang="ts">
import { computed } from "vue";
import { ago, fmtInt, fmtUtc, fmtUtcTime } from "../lib/format.js";
import { CLOCK, STATUS, useInjected } from "../lib/keys.js";

const STALE_MS = 30 * 60_000;
const poll = useInjected(STATUS);
const clock = useInjected(CLOCK);

const state = computed<{ cls: string; text: string }>(() => {
  const since = poll.errorSince.value;
  if (since !== null) {
    return { cls: "bad", text: `API unreachable since ${fmtUtcTime(since.toISOString())} UTC` };
  }
  const s = poll.status.value;
  if (s === null) return { cls: "", text: "Connecting to the catalog…" };
  if (s.lastSuccessfulFeed === null) {
    return { cls: "warn", text: "Live · USGS ComCat · no feed sync yet" };
  }
  const now = clock.now.value;
  const age = now.getTime() - Date.parse(s.lastSuccessfulFeed);
  return {
    cls: age > STALE_MS ? "warn" : "",
    text: `Live · USGS ComCat · feed synced ${fmtUtc(s.lastSuccessfulFeed)} UTC · ${ago(s.lastSuccessfulFeed, now)} ago`,
  };
});

const totals = computed(() => {
  const s = poll.status.value;
  if (s === null) return "";
  const since = s.events.oldest === null ? "" : ` since ${s.events.oldest.slice(0, 10)}`;
  return `${fmtInt(s.events.total)} events${since} · ${fmtInt(s.mechanisms.total)} solutions`;
});
</script>

<template>
  <div class="status" :class="state.cls" aria-live="polite">
    <span>{{ state.text }}</span>
    <span v-if="totals !== ''">{{ totals }}</span>
  </div>
</template>
