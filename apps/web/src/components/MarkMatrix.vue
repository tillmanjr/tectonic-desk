<script setup lang="ts">
import { computed } from "vue";
import { fmtInt } from "../lib/format.js";
import { MARKS_NAV, useInjected, VOLCANOES, ZONE } from "../lib/keys.js";
import type { MarkView } from "../lib/marks.js";
import { captionOf, pairCell, pointOf, type MarkPoint, type PairCell } from "../lib/matrix.js";
import { eruptionAnchor } from "../lib/volcanoes.js";

interface Row {
  p: MarkPoint;
  cells: (PairCell | null)[];
}

/** A group's marks compared pairwise: time apart, magnitude and depth differences for earthquakes, distance. */
const props = defineProps<{ view: MarkView }>();
const nav = useInjected(MARKS_NAV);
const volcanoes = useInjected(VOLCANOES);
const zone = useInjected(ZONE);

const points = computed(() =>
  props.view.marks.map((m) => pointOf(m, (n) => eruptionAnchor(volcanoes.eruptionsFor(n)))),
);
/** Upper triangle only: each pair once; the diagonal and below stay blank. */
const rows = computed<Row[]>(() =>
  points.value.map((p, i) => ({
    p,
    cells: points.value.map((q, j) => (j > i ? pairCell(p, q) : null)),
  })),
);
</script>

<template>
  <div class="markmatrix">
    <button type="button" class="backtolist" @click="nav.list(view.id)">← Back to list</button>
    <p v-if="points.length < 2" class="note">Mark at least two events to compare them.</p>
    <template v-else>
      <div class="matrixwrap">
        <table class="matrix">
          <thead>
            <tr>
              <th></th>
              <th v-for="p in points" :key="p.mark.id" scope="col">
                <span class="mname"
                  ><i class="kind" :class="p.mark.kind"></i>{{ p.mark.name }}</span
                >
                <span class="mwhen">{{ captionOf(p, zone) }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.p.mark.id">
              <th scope="row">
                <span class="mname"
                  ><i class="kind" :class="row.p.mark.kind"></i>{{ row.p.mark.name }}</span
                >
                <span class="mwhen">{{ captionOf(row.p, zone) }}</span>
              </th>
              <td v-for="(c, j) in row.cells" :key="j" :class="{ blank: c === null }">
                <template v-if="c !== null">
                  <span class="cl time">{{ c.time === null ? "— apart" : `${c.time} apart` }}</span>
                  <span v-if="c.dMag !== null" class="cl">ΔM {{ c.dMag.toFixed(1) }}</span>
                  <span v-if="c.dDepth !== null" class="cl"
                    >Δdepth {{ Math.round(c.dDepth) }} km</span
                  >
                  <span class="cl">{{ fmtInt(Math.round(c.km)) }} km</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cap">
        Each pair once: time apart in the two largest units (a volcano dates from its latest
        eruption's onset, at the precision GVP gives), ΔM and Δdepth between earthquakes only, and
        the great-circle distance.
      </p>
    </template>
  </div>
</template>
