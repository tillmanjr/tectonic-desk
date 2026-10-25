<script setup lang="ts">
import { ref } from "vue";
import SpaceAlerts from "./SpaceAlerts.vue";
import SpaceAurora from "./SpaceAurora.vue";
import SpaceFlares from "./SpaceFlares.vue";
import SpaceForecast from "./SpaceForecast.vue";
import SpaceRefine from "./SpaceRefine.vue";
import SpaceStack from "./SpaceStack.vue";
import SpaceTiles from "./SpaceTiles.vue";
import { SPACE, useInjected } from "../lib/keys.js";

/** The Space page: window controls, six tiles, the series stack with its rail, and the aurora pair. */
const store = useInjected(SPACE);
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
  <section class="spacegrid">
    <SpaceStack :highlight="highlight" />
    <div class="spacerail">
      <SpaceForecast />
      <SpaceFlares v-model:highlight="highlight" />
      <SpaceAlerts />
    </div>
  </section>
  <SpaceAurora />
</template>
