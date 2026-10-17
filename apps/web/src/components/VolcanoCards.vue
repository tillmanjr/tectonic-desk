<script setup lang="ts">
import { ago, fmtStamp } from "../lib/format.js";
import { CLOCK, SELECT_VOLCANO, useInjected, VOLCANOES, ZONE } from "../lib/keys.js";
import { aviationColor, isElevated, statusLabel } from "../lib/volcanoes.js";

const store = useInjected(VOLCANOES);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const selectVolcano = useInjected(SELECT_VOLCANO);
</script>

<template>
  <section class="major">
    <p v-if="store.attention.value.length === 0" class="note">
      No monitored volcano is above normal and none changed status in the last 7 days.
    </p>
    <button
      v-for="a in store.attention.value"
      :key="`${a.status.source}:${a.status.key}`"
      type="button"
      class="mcard vcard"
      :style="{ '--sevc': aviationColor(a.status.color) }"
      :disabled="a.volcano === null"
      @click="a.volcano !== null && selectVolcano(a.volcano.number)"
    >
      <span class="dot" :style="{ background: aviationColor(a.status.color) }"></span>
      <span>
        <span class="t"
          >{{ a.status.name
          }}<template v-if="a.volcano !== null"> · {{ a.volcano.country }}</template></span
        >
        <span class="pill" :style="{ color: aviationColor(a.status.color) }">{{
          statusLabel(a.status)
        }}</span>
        <span v-if="!isElevated(a.status)" class="pill">back to normal</span>
        <span class="m">
          {{ isElevated(a.status) ? "at this level since" : "changed" }}
          {{ fmtStamp(a.status.observedAt, zone) }} ·
          {{ ago(a.status.observedAt, clock.now.value) }} ago
        </span>
        <span v-if="a.status.synopsis !== null" class="m">{{ a.status.synopsis }}</span>
      </span>
    </button>
  </section>
</template>
