<script setup lang="ts">
import type { ApiEventDetail } from "@tectonic/shared";
import { computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import EventDetailBody from "./EventDetailBody.vue";
import MarkButton from "./MarkButton.vue";
import { fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, SELECT, useInjected } from "../lib/keys.js";
import type { MarkSubject } from "../lib/marks.js";

/** The event side panel: header, mark row and the fetched body; open while an event is selected. */
const catalog = useInjected(CATALOG);
const select = useInjected(SELECT);

/** The fetched detail, re-emitted by the body, for the header and the mark subject. */
const detail = shallowRef<ApiEventDetail | null>(null);
const open = computed(() => catalog.selectedId.value !== null);
const head = computed(() => detail.value ?? catalog.selected.value);
const subject = computed<MarkSubject | null>(() => {
  const h = head.value;
  if (h === null) return null;
  const r = catalog.region.value;
  return {
    kind: "event",
    ref: h.id,
    frame: r !== null && r.bbox !== null ? "wc" : "world",
    lon: h.longitude,
    lat: h.latitude,
    headline: `M${fmtMag(h.mag, true)} ${h.magType ?? ""}`.trim(),
    sub: placeOf(h),
    stamp: h.time,
  };
});
watch(catalog.selectedId, (id) => {
  if (id === null) detail.value = null;
});
function onLoaded(d: ApiEventDetail | null): void {
  detail.value = d;
}
function close(): void {
  select(null);
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && open.value) close();
}
onMounted(() => {
  document.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <aside class="detail" :class="{ open }" aria-label="Event detail" :aria-hidden="!open">
    <div class="hd">
      <div>
        <div class="mag num">
          <template v-if="head !== null"
            >M{{ fmtMag(head.mag, true) }} <span class="magtype">{{ head.magType }}</span></template
          >
          <template v-else>{{ catalog.selectedId.value }}</template>
        </div>
        <div class="place">
          {{ head === null ? "" : placeOf(head) }}
          <span
            v-if="head !== null && head.eventType !== null && head.eventType !== 'earthquake'"
            class="pill"
            >{{ head.eventType }}</span
          >
        </div>
      </div>
      <button type="button" class="close" aria-label="Close detail" @click="close">×</button>
    </div>
    <MarkButton :subject="subject" />
    <div class="bd">
      <EventDetailBody
        v-if="catalog.selectedId.value !== null"
        :id="catalog.selectedId.value"
        @loaded="onLoaded"
      />
    </div>
  </aside>
</template>
