<script setup lang="ts">
import { faultingStyle, planesOf, type ApiEventDetail, type ApiMechanism } from "@tectonic/shared";
import { computed, ref, shallowRef, watch } from "vue";
import MechanismBlock from "./MechanismBlock.vue";
import { ApiRequestError, errorMessage } from "../lib/api.js";
import { depthClass, depthColor, DEPTH_LABEL } from "../lib/depth.js";
import { ago, fmtCoord, fmtMag, fmtStamp, type Zone } from "../lib/format.js";
import { API, CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { parentOf, sequenceOf } from "../lib/sequence.js";
import { preferredMechanism } from "../lib/stats.js";

interface ImpactRow {
  k: string;
  v: string;
  color?: string;
}

/** The body of an event's detail: fetched by id, rendered in the side panel and in a marked-events card. */
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ loaded: [detail: ApiEventDetail | null] }>();
const api = useInjected(API);
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const zone = useInjected(ZONE);
const otherZone = computed<Zone>(() => (zone.value === "utc" ? "local" : "utc"));

const detail = shallowRef<ApiEventDetail | null>(null);
const loading = ref(false);
const notFound = ref(false);
const error = ref<string | null>(null);
let seq = 0;

async function load(id: string): Promise<void> {
  const token = ++seq;
  loading.value = true;
  notFound.value = false;
  error.value = null;
  detail.value = null;
  emit("loaded", null);
  try {
    const d = await api.event(id);
    if (token !== seq) return;
    detail.value = d;
    emit("loaded", d);
  } catch (e) {
    if (token !== seq) return;
    if (e instanceof ApiRequestError && e.status === 404) notFound.value = true;
    else error.value = errorMessage(e);
  } finally {
    if (token === seq) loading.value = false;
  }
}
function retry(): void {
  void load(props.id);
}
watch(
  () => props.id,
  (id) => {
    void load(id);
  },
  { immediate: true },
);

const derived = computed(() => {
  const d = detail.value;
  if (d === null) return null;
  const preferred = preferredMechanism(d);
  const impact: ImpactRow[] = [];
  if (d.sig !== null) impact.push({ k: "Significance", v: String(d.sig) });
  if (d.felt !== null) impact.push({ k: "DYFI reports", v: d.felt.toLocaleString("en-US") });
  if (d.cdi !== null) impact.push({ k: "Max CDI (DYFI)", v: d.cdi.toFixed(1) });
  if (d.mmi !== null) impact.push({ k: "Max MMI (ShakeMap)", v: d.mmi.toFixed(1) });
  if (d.alert !== null) {
    impact.push({ k: "PAGER alert", v: d.alert.toUpperCase(), color: `var(--sev-${d.alert})` });
  }
  if (d.tsunami) {
    impact.push({
      k: "Tsunami flag",
      v: "Set (NTWC/PTWC information exists; not itself a warning)",
    });
  }
  return {
    d,
    preferred,
    others: d.mechanisms.filter((m) => m !== preferred),
    advertised: d.types.find((t) => t === "moment-tensor" || t === "focal-mechanism") ?? null,
    impact,
    sequence: sequenceOf(d, catalog.events.value, clock.now.value),
    parent: parentOf(d, catalog.events.value),
  };
});

function describe(m: ApiMechanism): string {
  const solved = planesOf(m);
  if (solved === null) return "no geometry published";
  const [p1, p2] = solved.planes;
  const pf = (p: { strike: number; dip: number; rake: number }): string =>
    `${p.strike.toFixed(0)}/${p.dip.toFixed(0)}/${p.rake.toFixed(0)}`;
  const flag = m.planesReconstructed || solved.reconstructed ? " · reconstructed" : "";
  return `${faultingStyle(p1)} · ${pf(p1)} and ${pf(p2)}${flag}`;
}
</script>

<template>
  <div class="panelbody">
    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="notFound" class="note">Event not found in the catalog.</p>
    <div v-else-if="error !== null" class="banner error">
      <span>{{ error }}</span>
      <button type="button" class="retry" @click="retry">Retry</button>
    </div>
    <template v-else-if="derived !== null">
      <dl class="kv">
        <dt>Origin time</dt>
        <dd>{{ fmtStamp(derived.d.time, zone, { seconds: true }) }}</dd>
        <dt></dt>
        <dd>
          {{ fmtStamp(derived.d.time, otherZone) }} · {{ ago(derived.d.time, clock.now.value) }} ago
        </dd>
        <dt>Epicenter</dt>
        <dd>{{ fmtCoord(derived.d.latitude, derived.d.longitude) }}</dd>
        <dt>Depth</dt>
        <dd>
          <span class="dchip" :style="{ background: depthColor(derived.d.depthKm) }"></span>
          <template v-if="derived.d.depthKm !== null"
            >{{ derived.d.depthKm.toFixed(1) }} km · </template
          >{{ DEPTH_LABEL[depthClass(derived.d.depthKm)] }}
        </dd>
        <dt>Event ID</dt>
        <dd>{{ derived.d.id }}</dd>
      </dl>
      <MechanismBlock
        v-if="derived.preferred !== null"
        :mechanism="derived.preferred"
        :depth-km="derived.d.depthKm"
      />
      <p v-else-if="derived.advertised !== null" class="note">
        No solution yet. USGS lists a {{ derived.advertised }} product for this event; the solution
        arrives with the next detail fetch.
      </p>
      <p v-else class="note">
        USGS has not published a moment tensor or focal mechanism for this event.
      </p>
      <div v-if="derived.others.length > 0">
        <h3>Other solutions</h3>
        <div class="other-solutions">
          <template v-for="m in derived.others" :key="m.id">
            <span class="num">{{ m.source }} {{ m.kind.toUpperCase() }}</span>
            <span>{{ describe(m) }}</span>
          </template>
        </div>
      </div>
      <div v-if="derived.impact.length > 0">
        <h3>Impact</h3>
        <dl class="kv">
          <template v-for="row in derived.impact" :key="row.k">
            <dt>{{ row.k }}</dt>
            <dd
              :style="row.color === undefined ? undefined : { color: row.color, fontWeight: 600 }"
            >
              {{ row.v }}
            </dd>
          </template>
        </dl>
      </div>
      <div v-if="derived.sequence !== null">
        <h3>Sequence</h3>
        <p class="note" style="margin: 0">
          {{ derived.sequence.count }} later
          {{ derived.sequence.count === 1 ? "event" : "events" }} ≥M{{
            catalog.requireRegion().minMag
          }}
          within 150 km in the {{ derived.sequence.spanHours.toFixed(0) }} h to now; largest M{{
            fmtMag(derived.sequence.largest.mag)
          }}.
        </p>
      </div>
      <div v-if="derived.parent !== null">
        <h3>Sequence</h3>
        <p class="note" style="margin: 0">
          Within 150 km of, and after, the M{{ fmtMag(derived.parent.mag) }} event of
          {{ fmtStamp(derived.parent.time, zone) }}.
          <a href="#" class="parent" @click.prevent="select(derived.parent.id)">Open that event</a>
        </p>
      </div>
      <div>
        <h3>Catalog</h3>
        <dl class="kv">
          <dt>Review status</dt>
          <dd>{{ derived.d.status ?? "—" }}</dd>
          <dt>USGS updated</dt>
          <dd>{{ fmtStamp(derived.d.updated, zone, { seconds: true }) }}</dd>
          <dt>First seen here</dt>
          <dd>{{ fmtStamp(derived.d.firstSeen, zone) }}</dd>
          <dt>Last seen</dt>
          <dd>{{ fmtStamp(derived.d.lastSeen, zone) }}</dd>
        </dl>
      </div>
      <p>
        <a
          :href="`https://earthquake.usgs.gov/earthquakes/eventpage/${derived.d.id}`"
          target="_blank"
          rel="noopener"
          >USGS event page</a
        >
        · ShakeMap, DYFI, finite fault and the full product set
      </p>
    </template>
  </div>
</template>
