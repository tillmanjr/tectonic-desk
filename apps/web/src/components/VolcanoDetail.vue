<script setup lang="ts">
import type { ApiVolcanoDetail, Eruption } from "@tectonic/shared";
import { computed, ref, shallowRef, watch } from "vue";
import NearbyQuakes from "./NearbyQuakes.vue";
import { errorMessage } from "../lib/api.js";
import { fmtCoord, fmtStamp } from "../lib/format.js";
import { API, CLOCK, SELECT_VOLCANO, useInjected, VOLCANOES, ZONE } from "../lib/keys.js";
import {
  aviationColor,
  eruptionStart,
  SETTING_GROUPS,
  settingGroup,
  statusLabel,
  TYPE_GROUPS,
  typeGroup,
} from "../lib/volcanoes.js";

const STRIP_FROM = 1800;

interface StripBar {
  e: Eruption;
  x: number;
  w: number;
  h: number;
  open: boolean;
  queried: boolean;
}

const api = useInjected(API);
const store = useInjected(VOLCANOES);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const selectVolcano = useInjected(SELECT_VOLCANO);

const detail = shallowRef<ApiVolcanoDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let seq = 0;

async function load(number: number): Promise<void> {
  const token = ++seq;
  loading.value = true;
  error.value = null;
  detail.value = null;
  try {
    const d = await api.volcano(number);
    if (token !== seq) return;
    detail.value = d;
  } catch (e) {
    if (token !== seq) return;
    error.value = errorMessage(e);
  } finally {
    if (token === seq) loading.value = false;
  }
}
watch(
  store.selectedNumber,
  (n) => {
    if (n === null) {
      seq += 1;
      detail.value = null;
      loading.value = false;
      error.value = null;
      return;
    }
    void load(n);
  },
  { immediate: true },
);

const open = computed(() => store.selectedNumber.value !== null);
const v = store.selected;
const eruptions = computed(() => store.eruptionsFor(store.selectedNumber.value));
const W = 300;
const strip = computed(() => {
  const to = clock.now.value.getUTCFullYear() + 1;
  const span = to - STRIP_FROM;
  const recent = eruptions.value.filter((e) => e.startYear >= STRIP_FROM);
  const bars: StripBar[] = recent.map((e) => {
    const x = ((e.startYear - STRIP_FROM) / span) * W;
    const end = e.continuing ? to : (e.endYear ?? e.startYear);
    const w = Math.max(2, ((end - e.startYear) / span) * W);
    return {
      e,
      x,
      w,
      h: e.vei === null ? 4 : 6 + e.vei * 5,
      open: e.continuing,
      queried: e.veiModifier !== null,
    };
  });
  return { bars, earlier: eruptions.value.length - recent.length };
});
const gvpUrl = (number: number): string =>
  `https://volcano.si.edu/volcano.cfm?vn=${String(number)}`;
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
    <div class="bd">
      <template v-if="v !== null">
        <dl class="kv">
          <dt>Type</dt>
          <dd>{{ v.type }} · {{ TYPE_GROUPS[typeGroup(v.type)] }}</dd>
          <dt>Setting</dt>
          <dd>{{ v.tectonicSetting ?? SETTING_GROUPS[settingGroup(v.tectonicSetting)] }}</dd>
          <dt>Summit</dt>
          <dd>
            <template v-if="v.elevationM !== null">{{ v.elevationM }} m · </template
            >{{ fmtCoord(v.lat, v.lon) }}
          </dd>
          <dt v-if="v.rockType !== null">Rock</dt>
          <dd v-if="v.rockType !== null">{{ v.rockType }}</dd>
          <dt>Last eruption</dt>
          <dd>
            <template v-if="v.lastEruptionYear !== null">{{ v.lastEruptionYear }}</template>
            <template v-else>unknown</template>
            <template v-if="v.evidence !== null"> · {{ v.evidence }}</template>
          </dd>
          <dt>GVP number</dt>
          <dd>
            <a :href="gvpUrl(v.number)">{{ v.number }}</a>
          </dd>
        </dl>
        <p v-if="v.summary !== null" class="summary">{{ v.summary }}</p>

        <h3>Status</h3>
        <p v-if="loading" class="note">Loading…</p>
        <p v-else-if="error !== null" class="note">{{ error }}</p>
        <template v-else-if="detail !== null">
          <p v-if="detail.statuses.length === 0" class="note">
            Not monitored by USGS or GeoNet, so no agency alert level is held here.
          </p>
          <ul v-else class="statuslist">
            <li v-for="s in detail.statuses" :key="s.id">
              <span class="dot" :style="{ background: aviationColor(s.color) }"></span>
              <span>
                <b>{{ statusLabel(s) }}</b> since {{ fmtStamp(s.observedAt, zone) }}
                <template v-if="s.synopsis !== null"> · {{ s.synopsis }}</template>
                <a v-if="s.url !== null" :href="s.url"> notice</a>
              </span>
            </li>
          </ul>
          <template v-if="detail.reports.length > 0">
            <h3>Weekly report</h3>
            <div v-for="r in detail.reports" :key="r.id" class="report">
              <b>{{ fmtStamp(r.week, zone, { label: false }) }}</b> ·
              {{ r.category === "new" ? "new activity" : "ongoing activity" }}
              <div class="reportbody" v-text="r.body.replace(/<[^>]+>/g, ' ')"></div>
            </div>
          </template>
        </template>

        <h3>Eruptions</h3>
        <p v-if="eruptions.length === 0" class="note">No eruption records in the GVP catalogue.</p>
        <template v-else>
          <svg class="strip" :viewBox="`0 0 ${String(W)} 50`" aria-label="Eruptions since 1800">
            <line x1="0" y1="46" :x2="W" y2="46" style="stroke: var(--line)" />
            <text
              v-for="yr in [1800, 1900, 2000]"
              :key="yr"
              :x="((yr - STRIP_FROM) / (clock.now.value.getUTCFullYear() + 1 - STRIP_FROM)) * W"
              y="49"
              style="fill: var(--muted); font: 7px var(--f-data)"
            >
              {{ yr }}
            </text>
            <rect
              v-for="b in strip.bars"
              :key="b.e.number"
              :x="b.x"
              :y="44 - b.h"
              :width="b.w"
              :height="b.h"
              :style="{
                fill: b.open ? 'none' : b.queried ? 'var(--vc-historic)' : 'var(--vc-recent)',
                stroke: 'var(--vc-recent)',
              }"
              :stroke-dasharray="b.queried ? '2 1' : undefined"
            >
              <title>
                {{ eruptionStart(b.e)
                }}{{ b.e.vei === null ? "" : ` · VEI ${String(b.e.vei)}${b.e.veiModifier ?? ""}`
                }}{{ b.open ? " · continuing" : "" }}
              </title>
            </rect>
          </svg>
          <p class="cap">
            {{ strip.bars.length }} since 1800 (bar height is VEI; open bar continuing; dashed
            queried){{ strip.earlier > 0 ? `, ${String(strip.earlier)} earlier.` : "." }}
          </p>
          <ul class="erlist">
            <li v-for="e in eruptions.slice(0, 8)" :key="e.number">
              <span class="num">{{ eruptionStart(e) }}</span>
              <template v-if="e.endYear !== null && !e.continuing"> to {{ e.endYear }}</template>
              <template v-if="e.continuing"> · continuing</template>
              <template v-if="e.vei !== null"> · VEI {{ e.vei }}{{ e.veiModifier ?? "" }}</template>
              <template v-if="e.activity !== 'Confirmed Eruption'"> · {{ e.activity }}</template>
            </li>
          </ul>
        </template>

        <NearbyQuakes :volcano="v" />
      </template>
      <p v-else-if="open" class="note">
        Volcano {{ store.selectedNumber.value }} is not in the Holocene catalogue held here.
      </p>
    </div>
  </aside>
</template>
