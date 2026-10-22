<script setup lang="ts">
import { computed } from "vue";
import MatrixArrow from "./MatrixArrow.vue";
import { MARKS_NAV, useInjected, VOLCANOES, ZONE } from "../lib/keys.js";
import type { MarkView } from "../lib/marks.js";
import { kmText, nodeLines, pointOf, staircase } from "../lib/matrix.js";
import { eruptionAnchor } from "../lib/volcanoes.js";

/**
 * A group's marks compared pairwise as connected vertices: the top nodes are all marks but the
 * last, the left nodes all but the first, and each edge card reads from its left node to its top node.
 */
const props = defineProps<{ view: MarkView }>();
const nav = useInjected(MARKS_NAV);
const volcanoes = useInjected(VOLCANOES);
const zone = useInjected(ZONE);

const points = computed(() =>
  props.view.marks.map((m) => pointOf(m, (n) => eruptionAnchor(volcanoes.eruptionsFor(n)))),
);
const grid = computed(() => staircase(points.value, zone.value));
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
              <th v-for="p in grid.cols" :key="p.mark.id" scope="col">
                <span class="node">
                  <span class="mname"
                    ><i class="kind" :class="p.mark.kind"></i>{{ p.mark.name }}</span
                  >
                  <span v-for="line in nodeLines(p, zone)" :key="line" class="mwhen">{{
                    line
                  }}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in grid.rows" :key="row.p.mark.id">
              <th scope="row">
                <span class="node">
                  <span class="mname"
                    ><i class="kind" :class="row.p.mark.kind"></i>{{ row.p.mark.name }}</span
                  >
                  <span v-for="line in nodeLines(row.p, zone)" :key="line" class="mwhen">{{
                    line
                  }}</span>
                </span>
              </th>
              <td v-for="(c, j) in row.cells" :key="j" :class="c === null ? 'blank' : 'edge'">
                <span v-if="c !== null" class="card">
                  <span class="chart">
                    <span class="h"></span>
                    <span class="h arrow" title="the mark at the left"
                      ><MatrixArrow dir="left"
                    /></span>
                    <span class="h dh" title="change from the left mark to the top mark"
                      >Δ <MatrixArrow dir="left" small /><MatrixArrow dir="up" small
                    /></span>
                    <span class="h arrow" title="the mark at the top"
                      ><MatrixArrow dir="up"
                    /></span>
                    <template v-for="r in c.rows" :key="r.label">
                      <span class="k">{{ r.label }}</span>
                      <span class="v">{{ r.left }}</span>
                      <span class="d">{{ r.delta }}</span>
                      <span class="v">{{ r.top }}</span>
                    </template>
                    <span class="foot">{{ kmText(c.km) }}</span>
                  </span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cap">
        Read each card from the node at its left to the node above it: Δ is the top mark relative to
        the left one, so a negative time means the top mark came earlier, +0.6 that it is 0.6
        larger, −68 km that it is 68 km shallower. A volcano dates from its latest eruption's onset
        and has no magnitude or depth.
      </p>
    </template>
  </div>
</template>
