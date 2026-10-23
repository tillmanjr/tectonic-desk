<script setup lang="ts">
import { faultingStyle, planesOf, type ApiEvent, type ApiMechanism } from "@tectonic/shared";
import { computed } from "vue";
import BeachballImage from "./BeachballImage.vue";
import CardGrid from "./CardGrid.vue";
import { ago, fmtMag, fmtStamp, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { sequenceOf, type Sequence } from "../lib/sequence.js";
import { majorEvents, majorLabel, preferredMechanism } from "../lib/stats.js";

interface Card {
  e: ApiEvent;
  mech: ApiMechanism | null;
  style: string | null;
  seq: Sequence | null;
}

/** Rows of cards before the "more" control (null shows them all) and the row's dataset trim. */
const props = withDefaults(
  defineProps<{ rows?: number | null; trim?: "quakes" | "volcanoes" | null }>(),
  { rows: null, trim: null },
);
const catalog = useInjected(CATALOG);
const { events } = catalog;
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const zone = useInjected(ZONE);

const minMag = computed(() => catalog.requireRegion().minMag);
const cards = computed<Card[]>(() =>
  majorEvents(events.value, catalog.requireRegion()).map((e) => {
    const mech = preferredMechanism(e);
    const planes = mech === null ? null : planesOf(mech);
    return {
      e,
      mech,
      style: planes === null ? null : faultingStyle(planes.planes[0]),
      seq: sequenceOf(e, events.value, clock.now.value),
    };
  }),
);

const depthText = (km: number | null): string => (km === null ? "—" : String(Math.round(km)));
const sevStyle = (alert: string | null): Record<string, string> | undefined =>
  alert === null ? undefined : { "--sevc": `var(--sev-${alert})` };
</script>

<template>
  <CardGrid
    v-slot="{ limit }"
    :label="majorLabel(catalog.requireRegion())"
    :count="cards.length"
    :rows="props.rows"
    :trim="props.trim"
  >
    <p v-if="cards.length === 0" class="note">No events meet the threshold in this window.</p>
    <button
      v-for="c in cards.slice(0, limit ?? cards.length)"
      :key="c.e.id"
      type="button"
      class="mcard"
      :style="sevStyle(c.e.alert)"
      @click="select(c.e.id)"
    >
      <BeachballImage
        v-if="c.mech !== null"
        :mechanism="c.mech"
        :px="50"
        :depth-km="c.e.depthKm"
        alt=""
      />
      <span v-else class="dot">no solution yet</span>
      <span>
        <span class="t">M{{ fmtMag(c.e.mag) }} · {{ placeOf(c.e) }}</span>
        <span v-if="c.e.alert !== null" class="pill" :style="{ color: `var(--sev-${c.e.alert})` }"
          >PAGER {{ c.e.alert }}</span
        >
        <span v-if="c.e.tsunami" class="pill" style="color: var(--accent)">Tsunami flag</span>
        <span v-if="c.e.eventType !== null && c.e.eventType !== 'earthquake'" class="pill">{{
          c.e.eventType
        }}</span>
        <span class="m">
          {{ fmtStamp(c.e.time, zone) }} · {{ ago(c.e.time, clock.now.value) }} ago ·
          {{ depthText(c.e.depthKm) }} km<template v-if="c.style !== null">
            · {{ c.style }}</template
          >
        </span>
        <span v-if="c.seq !== null" class="m">
          Followed by {{ c.seq.count }} {{ c.seq.count === 1 ? "event" : "events" }} ≥M{{
            minMag
          }}
          within 150 km; largest M{{ fmtMag(c.seq.largest.mag) }}
        </span>
      </span>
    </button>
  </CardGrid>
</template>
