<script setup lang="ts">
import { computed } from "vue";
import MarkButton from "./MarkButton.vue";
import VolcanoDetailBody from "./VolcanoDetailBody.vue";
import { SELECT_VOLCANO, useInjected, VOLCANOES } from "../lib/keys.js";
import type { MarkSubject } from "../lib/marks.js";

/** The volcano side panel: header, mark row and the body; open while a volcano is selected. */
const store = useInjected(VOLCANOES);
const selectVolcano = useInjected(SELECT_VOLCANO);

const open = computed(() => store.selectedNumber.value !== null);
const v = store.selected;
const subject = computed<MarkSubject | null>(() => {
  const x = v.value;
  if (x === null) return null;
  const r = store.region.value;
  return {
    kind: "volcano",
    ref: String(x.number),
    frame: r !== null && r.bbox !== null ? "wc" : "world",
    lon: x.lon,
    lat: x.lat,
    headline: x.name,
    sub: `${x.country} · ${x.region}`,
    stamp: null,
    mag: null,
    depthKm: null,
  };
});
function close(): void {
  selectVolcano(null);
}
</script>

<template>
  <aside class="detail vdetail" :class="{ open }" aria-label="Volcano detail" :aria-hidden="!open">
    <div class="hd">
      <div>
        <div class="mag">{{ v === null ? store.selectedNumber.value : v.name }}</div>
        <div class="place">
          <template v-if="v !== null">{{ v.country }} · {{ v.region }}</template>
          <template v-else>not in the GVP Holocene catalogue</template>
        </div>
      </div>
      <button type="button" class="close" aria-label="Close volcano detail" @click="close">
        ×
      </button>
    </div>
    <MarkButton :subject="subject" />
    <div class="bd">
      <VolcanoDetailBody
        v-if="store.selectedNumber.value !== null"
        :number="store.selectedNumber.value"
      />
    </div>
  </aside>
</template>
