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
import BowlBeachball from "./BowlBeachball.vue";
import { fmtMoment } from "../lib/format.js";
import { SETTINGS, useInjected } from "../lib/keys.js";

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
const settings = useInjected(SETTINGS);
const bowl = computed(() => settings.current.value.beachball === "bowl");
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
      <BowlBeachball
        v-if="bowl"
        :mechanism="mechanism"
        :px="150"
        :depth-km="depthKm"
        alt="Beachball diagram, drawn as the inside of a bowl"
      />
      <BeachballImage
        v-else
        data-tour="mech.ball"
        :mechanism="mechanism"
        :px="150"
        :depth-km="depthKm"
        :axes="true"
        alt="Beachball diagram"
      />
      <div>
        <div class="style" data-tour="mech.style">{{ geo.style }}</div>
        <p v-if="geo.sense !== null" data-tour="mech.style">{{ geo.sense }}</p>
        <p v-if="bowl">
          Lower hemisphere, equal area at 0°, seen as the inside of the focal sphere. Shaded
          quadrants are compressional; T and P mark the tension and pressure axes, a dashed ring
          where the rim hides one.
        </p>
        <p v-else>
          Lower hemisphere, equal area. Shaded quadrants are compressional; T and P mark the tension
          and pressure axes.
        </p>
      </div>
    </div>
    <dl class="kv">
      <dt data-tour="mech.planes">Nodal plane 1</dt>
      <dd data-tour="mech.planes">{{ pf(geo.p1) }}</dd>
      <dt data-tour="mech.planes">Nodal plane 2</dt>
      <dd data-tour="mech.planes">{{ pf(geo.p2) }}</dd>
      <dt></dt>
      <dd class="hint" data-tour="mech.planes">
        strike / dip / rake<template v-if="geo.reconstructed">
          · reconstructed from P/T axes</template
        >
      </dd>
      <dt data-tour="mech.axes">T axis</dt>
      <dd data-tour="mech.axes">
        az {{ Math.round(geo.axes.t.azimuth) }}° · plunge {{ Math.round(geo.axes.t.plunge) }}°
      </dd>
      <dt data-tour="mech.axes">P axis</dt>
      <dd data-tour="mech.axes">
        az {{ Math.round(geo.axes.p.azimuth) }}° · plunge {{ Math.round(geo.axes.p.plunge) }}°
      </dd>
      <template v-if="mechanism.kind === 'mt'">
        <dt data-tour="mech.moment">Scalar moment</dt>
        <dd data-tour="mech.moment">
          <template v-if="moment !== null"
            >{{ moment.mantissa }} × 10<sup>{{ moment.exponent }}</sup> N·m</template
          >
          <template v-else>—</template>
        </dd>
        <dt data-tour="mech.moment">Moment magnitude</dt>
        <dd data-tour="mech.moment">
          {{ mechanism.mw === null ? "—" : `Mw ${String(mechanism.mw)}` }}
        </dd>
        <dt data-tour="mech.moment">Centroid depth</dt>
        <dd data-tour="mech.moment">
          {{ mechanism.depthKm === null ? "—" : `${String(mechanism.depthKm)} km` }}
        </dd>
        <dt data-tour="mech.moment">Double couple</dt>
        <dd data-tour="mech.moment">{{ dc }}</dd>
      </template>
      <dt>Solution source</dt>
      <dd>{{ mechanism.source }} network · {{ mechanism.code }}</dd>
    </dl>
  </div>
  <p v-else class="note">This product has no nodal planes or axes to draw.</p>
</template>
