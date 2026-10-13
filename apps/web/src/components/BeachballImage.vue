<script setup lang="ts">
import type { MechanismGeometry } from "@tectonic/shared";
import { computed } from "vue";
import { beachballUrl } from "../lib/beachball.js";
import { cssVar } from "../lib/colors.js";
import { depthVar } from "../lib/depth.js";
import { THEME, useInjected } from "../lib/keys.js";

const props = withDefaults(
  defineProps<{
    mechanism: MechanismGeometry;
    px: number;
    depthKm: number | null;
    axes?: boolean;
    alt?: string;
  }>(),
  { axes: false, alt: "" },
);
const theme = useInjected(THEME);
const colors = computed(() => ({
  theme: theme.resolved.value,
  fill: cssVar(depthVar(props.depthKm)),
  tension: cssVar("--tension"),
  ink: cssVar("--ink"),
}));
const url = computed(() => beachballUrl(props.mechanism, props.px, colors.value, props.axes));
</script>

<template>
  <img v-if="url !== ''" :src="url" :width="px" :height="px" :alt="alt" />
</template>
