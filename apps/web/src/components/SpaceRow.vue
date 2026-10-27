<script setup lang="ts">
import type { RowData } from "../lib/space-chart.js";

/** One row of the stack: its own y axis, reference lines, Kp bars, flare bands and series lines. */
defineProps<{ row: RowData; left: number; right: number }>();
</script>

<template>
  <g class="srow" :class="row.id">
    <line class="rowbase" :x1="left" :x2="right" :y1="row.bottom" :y2="row.bottom" />
    <text class="rowlabel" :x="left + 4" :y="row.top + 9">
      {{ row.label
      }}<tspan v-if="row.unit !== '' || row.rightUnit !== null" class="rowunit">
        · {{ [row.unit, row.rightUnit ?? ""].filter((u) => u !== "").join(" · ") }}</tspan
      >
    </text>
    <g class="axis">
      <g v-for="t in row.yTicks" :key="t.pos">
        <line :x1="left - 4" :x2="left" :y1="t.pos" :y2="t.pos" />
        <text :x="left - 6" :y="t.pos" dy="0.32em" text-anchor="end">{{ t.label }}</text>
      </g>
    </g>
    <g v-if="row.yRight.length > 0" class="axis rightaxis">
      <g v-for="t in row.yRight" :key="t.pos">
        <line :x1="right" :x2="right + 4" :y1="t.pos" :y2="t.pos" />
        <text :x="right + 6" :y="t.pos" dy="0.32em" text-anchor="start">{{ t.label }}</text>
      </g>
    </g>
    <g class="refs">
      <g v-for="r in row.refs" :key="r.label + String(r.y)">
        <line :x1="left" :x2="right" :y1="r.y" :y2="r.y" />
        <text v-if="r.label !== ''" :x="right - 4" :y="r.y - 2" text-anchor="end">{{
          r.label
        }}</text>
      </g>
    </g>
    <rect
      v-for="b in row.bands"
      :key="b.key"
      class="flareband"
      :class="{ hl: b.hl }"
      :x="b.x"
      :y="row.top"
      :width="b.w"
      :height="row.bottom - row.top"
    >
      <title>{{ b.label }}</title>
    </rect>
    <rect
      v-for="bar in row.bars"
      :key="bar.key"
      class="kpbar"
      :class="`lv${String(bar.level)}`"
      :x="bar.x"
      :y="bar.y"
      :width="bar.w"
      :height="bar.h"
    />
    <path
      v-for="l in row.lines"
      :key="l.series + (l.cls ?? '')"
      class="sline"
      :class="[l.series, l.cls]"
      :d="l.d"
    />
  </g>
</template>
