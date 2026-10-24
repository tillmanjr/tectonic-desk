<script setup lang="ts">
import { watch } from "vue";
import EventDetailBody from "./EventDetailBody.vue";
import MarkThumb from "./MarkThumb.vue";
import VolcanoDetailBody from "./VolcanoDetailBody.vue";
import { MARKS, MARKS_NAV, useInjected, VOLCANOES } from "../lib/keys.js";
import type { MarkView } from "../lib/marks.js";

/** A group's marks laid out as full panels, each over the same body the side panel renders. */
const props = defineProps<{ view: MarkView }>();
const nav = useInjected(MARKS_NAV);
const store = useInjected(MARKS);
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
      <article v-for="(m, i) in view.marks" :key="m.id" class="markcard">
        <header>
          <div class="morder">
            <button
              type="button"
              class="up"
              :disabled="i === 0"
              aria-label="Move earlier"
              @click="store.move(view.id, m.id, -1)"
            >
              ▲
            </button>
            <button
              type="button"
              class="down"
              :disabled="i === view.marks.length - 1"
              aria-label="Move later"
              @click="store.move(view.id, m.id, 1)"
            >
              ▼
            </button>
          </div>
          <MarkThumb :lon="m.lon" :lat="m.lat" :frame="m.frame" :kind="m.kind" />
          <div>
            <div class="mname">{{ m.name }}</div>
            <div class="mfacts">{{ m.headline }} · {{ m.sub }}</div>
          </div>
          <div class="mactions">
            <button
              type="button"
              class="openhere"
              title="Select it in the view you were in"
              @click="nav.openHere(m)"
            >
              Open here
            </button>
            <button type="button" class="openview" @click="nav.goTo(m.url)">Open view</button>
          </div>
        </header>
        <EventDetailBody v-if="m.kind === 'event'" :id="m.ref" />
        <VolcanoDetailBody v-else :number="Number(m.ref)" />
      </article>
    </div>
  </div>
</template>
