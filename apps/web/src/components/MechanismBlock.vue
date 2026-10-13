<script setup lang="ts">
import {
  axesFromTensor,
  faultingStyle,
  planesOf,
  storedAxes,
  strikeSlipSense,
  tensorFromPlane,
  type ApiMechanism,
  type NodalPlane,
} from "@tectonic/shared";
import { computed } from "vue";
import BeachballImage from "./BeachballImage.vue";
import { fmtMoment } from "../lib/format.js";

const props = defineProps<{ mechanism: ApiMechanism; depthKm: number | null }>();

const pf = (p: NodalPlane): string =>
  `${p.strike.toFixed(0).padStart(3, "0")}° / ${p.dip.toFixed(0)}° / ${p.rake.toFixed(0)}°`;

const geo = computed(() => {
  const m = props.mechanism;
  const solved = planesOf(m);
  if (solved === null) return null;
  const [p1, p2] = solved.planes;
  const style = faultingStyle(p1);
  const sense = style.includes("Strike-slip")
    ? `${strikeSlipSense(p1)} on plane 1 (${p1.strike.toFixed(0)}°) or ${strikeSlipSense(p2)} on plane 2 (${p2.strike.toFixed(0)}°).`
    : null;
  const axes = storedAxes(m) ?? axesFromTensor(tensorFromPlane(p1));
  return {
    p1,
    p2,
    style,
    sense,
    axes,
    reconstructed: m.planesReconstructed || solved.reconstructed,
  };
});
const moment = computed(() => fmtMoment(props.mechanism.scalarMoment));
const dc = computed(() => {
  const v = props.mechanism.percentDc;
  if (v === null) return "—";
  return `${String(Math.round(v * 100))}%${v < 0.5 ? " · large non-DC component; planes less diagnostic" : ""}`;
});
</script>

<template>
  <div v-if="geo !== null">
    <h3>{{ mechanism.kind === "mt" ? "Moment tensor" : "Focal mechanism (first motion)" }}</h3>
    <div class="mechbox">
      <BeachballImage
        :mechanism="mechanism"
        :px="150"
        :depth-km="depthKm"
        :axes="true"
        alt="Beachball diagram"
      />
      <div>
        <div class="style">{{ geo.style }}</div>
        <p v-if="geo.sense !== null">{{ geo.sense }}</p>
        <p>
          Lower hemisphere, equal area. Shaded quadrants are compressional; T and P mark the tension
          and pressure axes.
        </p>
      </div>
    </div>
    <dl class="kv">
      <dt>Nodal plane 1</dt>
      <dd>{{ pf(geo.p1) }}</dd>
      <dt>Nodal plane 2</dt>
      <dd>{{ pf(geo.p2) }}</dd>
      <dt></dt>
      <dd class="hint">
        strike / dip / rake<template v-if="geo.reconstructed">
          · reconstructed from P/T axes</template
        >
      </dd>
      <dt>T axis</dt>
      <dd>
        az {{ Math.round(geo.axes.t.azimuth) }}° · plunge {{ Math.round(geo.axes.t.plunge) }}°
      </dd>
      <dt>P axis</dt>
      <dd>
        az {{ Math.round(geo.axes.p.azimuth) }}° · plunge {{ Math.round(geo.axes.p.plunge) }}°
      </dd>
      <template v-if="mechanism.kind === 'mt'">
        <dt>Scalar moment</dt>
        <dd>
          <template v-if="moment !== null"
            >{{ moment.mantissa }} × 10<sup>{{ moment.exponent }}</sup> N·m</template
          >
          <template v-else>—</template>
        </dd>
        <dt>Moment magnitude</dt>
        <dd>{{ mechanism.mw === null ? "—" : `Mw ${String(mechanism.mw)}` }}</dd>
        <dt>Centroid depth</dt>
        <dd>{{ mechanism.depthKm === null ? "—" : `${String(mechanism.depthKm)} km` }}</dd>
        <dt>Double couple</dt>
        <dd>{{ dc }}</dd>
      </template>
      <dt>Solution source</dt>
      <dd>{{ mechanism.source }} network · {{ mechanism.code }}</dd>
    </dl>
  </div>
  <p v-else class="note">This product has no nodal planes or axes to draw.</p>
</template>
