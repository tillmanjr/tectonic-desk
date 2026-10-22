<script setup lang="ts">
import { watch } from "vue";
import EventDetailBody from "./EventDetailBody.vue";
import MarkThumb from "./MarkThumb.vue";
import VolcanoDetailBody from "./VolcanoDetailBody.vue";
import { MARKS_NAV, useInjected, VOLCANOES } from "../lib/keys.js";
import type { MarkView } from "../lib/marks.js";

/** A group's marks laid out as full panels, each over the same body the side panel renders. */
const props = defineProps<{ view: MarkView }>();
const nav = useInjected(MARKS_NAV);
const volcanoes = useInjected(VOLCANOES);

// Volcano bodies need the catalogue, which the Earthquakes page never loads.
watch(
  () => props.view.marks.some((m) => m.kind === "volcano"),
  (needs) => {
    if (needs && volcanoes.volcanoes.value.length === 0) void volcanoes.load();
  },
  { immediate: true },
);
</script>

<template>
  <div class="markpanels">
    <button type="button" class="backtolist" @click="nav.list(view.id)">← Back to list</button>
    <div class="markcards">
      <article v-for="m in view.marks" :key="m.id" class="markcard">
        <header>
          <MarkThumb :lon="m.lon" :lat="m.lat" :frame="m.frame" :kind="m.kind" />
          <div>
            <div class="mname">{{ m.name }}</div>
            <div class="mfacts">{{ m.headline }} · {{ m.sub }}</div>
          </div>
          <button type="button" class="openview" @click="nav.goTo(m.url)">Open view</button>
        </header>
        <EventDetailBody v-if="m.kind === 'event'" :id="m.ref" />
        <VolcanoDetailBody v-else :number="Number(m.ref)" />
      </article>
    </div>
  </div>
</template>
