<script setup lang="ts">
import { computed } from "vue";
import { fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, useInjected } from "../lib/keys.js";
import { summary } from "../lib/stats.js";

const { events } = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const s = computed(() => summary(events.value, clock.now.value));
</script>

<template>
  <section class="stats" aria-label="Summary">
    <div class="stat">
      <div class="k">Events</div>
      <div class="v num">{{ s.count }}</div>
      <div class="s">{{ s.last24h }} in the last 24 h</div>
    </div>
    <div class="stat">
      <div class="k">Largest</div>
      <template v-if="s.largest !== null">
        <div class="v num">M{{ fmtMag(s.largest.mag) }}</div>
        <div class="s" :title="placeOf(s.largest.e)">{{ placeOf(s.largest.e) }}</div>
      </template>
      <template v-else>
        <div class="v num">—</div>
        <div class="s">no events in this window</div>
      </template>
    </div>
    <div class="stat">
      <div class="k">Mechanisms</div>
      <div class="v num">{{ s.withSolution }}</div>
      <div class="s">events with a solution</div>
    </div>
    <div class="stat">
      <div class="k">Deepest</div>
      <template v-if="s.deepest !== null">
        <div class="v num">
          {{ Math.round(s.deepest.km) }}<span style="font-size: 15px"> km</span>
        </div>
        <div class="s" :title="placeOf(s.deepest.e)">{{ placeOf(s.deepest.e) }}</div>
      </template>
      <template v-else>
        <div class="v num">—</div>
        <div class="s">no depths reported</div>
      </template>
    </div>
  </section>
</template>
