<script setup lang="ts">
import type { ApiSpaceScales } from "@tectonic/shared";
import { computed } from "vue";
import { SPACE, useInjected } from "../lib/keys.js";
import { fmtKp, scaleClass } from "../lib/space-format.js";

/** NOAA's scales: today as observed, then the three predicted days; R and S come as probabilities there. */
const store = useInjected(SPACE);

interface Row {
  key: string;
  label: string;
  row: ApiSpaceScales;
}

const dayLabel = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

const rows = computed<Row[]>(() => {
  const n = store.now.value;
  if (n === null) return [];
  const observed = n.scales.filter((r) => r.kind === "observed").at(-1);
  const out: Row[] =
    observed === undefined ? [] : [{ key: "today", label: "Today so far", row: observed }];
  for (const r of n.scales.filter((r) => r.kind === "predicted")) {
    out.push({ key: r.day, label: dayLabel(r.day), row: r });
  }
  return out;
});

const level = (n: number | null, letter: string): string =>
  n === null ? "—" : `${letter}${String(n)}`;
const pct = (p: number | null): string => (p === null ? "—" : `${String(p)}%`);
const kp = (v: number | null): string => (v === null ? "—" : fmtKp(v));
</script>

<template>
  <div class="panel spacepanel forecast">
    <h2>Forecast<span>NOAA scales</span></h2>
    <p v-if="rows.length === 0" class="cap note">No forecast yet.</p>
    <table v-else class="spacetable">
      <thead>
        <tr>
          <th>Day</th>
          <th>G</th>
          <th>R1–R2 / R3+</th>
          <th>S1+</th>
          <th>Kp max</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key" :class="r.row.kind">
          <td>{{ r.label }}</td>
          <td>
            <span class="sc" :class="scaleClass(r.row.g)">{{ level(r.row.g, "G") }}</span>
          </td>
          <template v-if="r.row.kind === 'observed'">
            <td>
              <span class="sc" :class="scaleClass(r.row.r)">{{ level(r.row.r, "R") }}</span>
            </td>
            <td>
              <span class="sc" :class="scaleClass(r.row.s)">{{ level(r.row.s, "S") }}</span>
            </td>
          </template>
          <template v-else>
            <td class="prob num">{{ pct(r.row.rMinorProb) }} / {{ pct(r.row.rMajorProb) }}</td>
            <td class="prob num">{{ pct(r.row.sProb) }}</td>
          </template>
          <td class="num">{{ kp(r.row.kpMax) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="cap">
      R and S on the coming days are probabilities; G is the predicted level. Observed levels are
      the day's highest so far.
    </p>
  </div>
</template>
