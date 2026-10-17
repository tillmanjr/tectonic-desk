<script setup lang="ts">
import type { ApiEvent, Volcano } from "@tectonic/shared";
import { computed } from "vue";
import { ago, fmtMag, offsetText, placeOf, type DatePrecision } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, VOLCANOES } from "../lib/keys.js";
import { distanceKm, eruptionAnchor } from "../lib/volcanoes.js";

/** Earthquakes of the loaded window within reach of a volcano, largest first. */
const NEARBY_KM = 50;
const TOP = 3;

const props = defineProps<{ volcano: Volcano }>();
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const store = useInjected(VOLCANOES);

const magOf = (e: ApiEvent): number => e.mag ?? -1;

const near = computed(() => {
  const { lat, lon } = props.volcano;
  const close = catalog.filtered.value.filter(
    (e) => distanceKm(lat, lon, e.latitude, e.longitude) <= NEARBY_KM,
  );
  const top = [...close].sort((a, b) => magOf(b) - magOf(a)).slice(0, TOP);
  return { count: close.length, top };
});
/** The eruption the offsets are measured from, when the GVP record has one. */
const anchor = computed(() => eruptionAnchor(store.eruptionsFor(props.volcano.number)));
const anchorText = computed(() => {
  const a = anchor.value;
  if (a === null) return "";
  const began = a.precision === "day" ? `began ${a.label}` : `began about ${a.label}`;
  return `Relative to the eruption that ${began}${a.continuing ? ", continuing" : ""} · `;
});
/** How much of an ISO stamp names the onset's day, month or year. */
const GRANULE: Record<DatePrecision, number> = { day: 10, month: 7, year: 4 };
const granule = (d: Date, p: DatePrecision): string => d.toISOString().slice(0, GRANULE[p]);
/** "1 mo 9 d after onset", "in the onset day", or today's "5.6 d ago" without an anchor. */
function when(e: ApiEvent): string {
  const a = anchor.value;
  if (a === null) return `${ago(e.time, clock.now.value)} ago`;
  const t = new Date(e.time);
  if (granule(t, a.precision) === granule(a.date, a.precision))
    return `in the onset ${a.precision}`;
  const side = t.getTime() < a.date.getTime() ? "before" : "after";
  return `${offsetText(a.date, t, a.precision)} ${side} onset`;
}
</script>

<template>
  <h3>Earthquakes within {{ NEARBY_KM }} km</h3>
  <p v-if="near.count === 0" class="note">None in the loaded window and filter.</p>
  <template v-else>
    <p class="cap">{{ anchorText }}{{ near.count }} in the loaded window; the largest:</p>
    <ul class="erlist">
      <li v-for="e in near.top" :key="e.id">
        <button type="button" class="linkbtn" @click="select(e.id)">
          M{{ fmtMag(e.mag) }} · {{ placeOf(e) }} · {{ when(e) }}
        </button>
      </li>
    </ul>
  </template>
</template>
