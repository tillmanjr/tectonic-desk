<script setup lang="ts">
import { ref } from "vue";
import SpaceAlerts from "./SpaceAlerts.vue";
import SpaceAurora from "./SpaceAurora.vue";
import SpaceFlares from "./SpaceFlares.vue";
import SpaceForecast from "./SpaceForecast.vue";
import SpaceRefine from "./SpaceRefine.vue";
import SpaceStack from "./SpaceStack.vue";
import SpaceTiles from "./SpaceTiles.vue";
import { SETTINGS, SPACE, useInjected } from "../lib/keys.js";

/** The Space page: window controls, six tiles, the alert cards, the series stack with its rail, and the aurora pair. */
const store = useInjected(SPACE);
const settings = useInjected(SETTINGS);
/** The flare the rail is pointing at, lit in the X-ray row. */
const highlight = ref<string | null>(null);
</script>

<template>
  <div v-if="store.error.value !== null" class="banner error" role="alert">
    <span>{{ store.error.value }}</span>
    <button type="button" @click="store.load()">Retry</button>
  </div>
  <SpaceRefine />
  <SpaceTiles />
  <SpaceAlerts :rows="settings.current.value.cardRows.alone" />
  <section class="spacegrid">
    <SpaceStack :highlight="highlight" />
    <div class="spacerail">
      <SpaceForecast />
      <SpaceFlares v-model:highlight="highlight" />
    </div>
  </section>
  <SpaceAurora />
</template>
