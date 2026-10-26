# Aurora Map Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `Aurora` toggle on every map that draws the aurora store's current frame as probability bands over a shaded night side, with a legend row.

**Architecture:** A `showAurora` ref in `useMapView`, a `MapAurora` layer component drawing through the frame's path, `MapShell` starting and stopping the shared aurora store with the toggle and feeding the legend.

**Tech Stack:** Vue 3, d3-geo, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-aurora-map-layer-design.md`.
- 100 % coverage on `apps/web/src`; no `as` to silence nullability, no `!`.
- Gate before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Branch `aurora-map-layer`; one commit per task; messages end with the Co-Authored-By line.

---

### Task 1: The layer component and the view ref

**Files:**

- Modify: `apps/web/src/lib/mapview.ts` (`showAurora`)
- Create: `apps/web/src/components/MapAurora.vue`
- Modify: `apps/web/src/styles.css` (`.aurora .night`, `.aurora .band.au-NN`)
- Test: `apps/web/test/components/MapAurora.test.ts`, the view test that lists the toggles

- [ ] **Step 1: Failing test.** Mount `MapAurora` with `path: geoPath(frameFor(GLOBAL).projection)`, `bands: auroraBands(ringGrid())`, `forecast: "2026-10-13T12:00:00Z"`: `g.aurora` exists, `path.night` has a `d` starting with `M`, `path.band` count is 5 with classes `au-10` … `au-90` in order and non-empty `d`. With `bands: []` only the night path remains.
- [ ] **Step 2: Implement.**

```vue
<script setup lang="ts">
import type { GeoPath } from "d3-geo";
import { computed } from "vue";
import { nightRing } from "../lib/aurora-map.js";
import type { AuroraBand } from "../lib/aurora-bands.js";
import { pathOf } from "../lib/geo.js";
import { subsolarPoint } from "../lib/sun.js";

/** The aurora store's frame on the map: the night side at the forecast time under the bands. */
const props = defineProps<{ path: GeoPath; bands: AuroraBand[]; forecast: string }>();
const night = computed(() =>
  pathOf(props.path, nightRing(subsolarPoint(new Date(props.forecast)))),
);
const bandPaths = computed(() =>
  props.bands.map((b) => ({ level: b.level, d: pathOf(props.path, b.shape) })),
);
</script>

<template>
  <g class="aurora" style="pointer-events: none">
    <path class="night" :d="night" />
    <path
      v-for="b in bandPaths"
      :key="b.level"
      class="band"
      :class="`au-${String(b.level)}`"
      :d="b.d"
    />
  </g>
</template>
```

(Check where `pathOf` lives; `AuroraMap.vue` imports it.) Styles: extend the `.polar .night` and `.polar .band.au-NN` selectors with `.aurora` equivalents.

- [ ] **Step 3: `showAurora`** in `useMapView` (`ref(false)`, returned, in the `MapView` interface). Add it to the view test's toggle assertions.
- [ ] **Step 4: Run, commit** `feat(web): aurora layer component for the world maps`.

### Task 2: Toggle, store lifetime and legend row

**Files:**

- Modify: `apps/web/src/components/MapShell.vue`, `apps/web/src/components/MapLegend.vue`
- Test: `apps/web/test/components/QuakeMap.test.ts`, `apps/web/test/components/MapLegend.test.ts`

- [ ] **Step 1: Failing tests.** QuakeMap: tick `input` after the `Subduction teeth` label → `ctx.api.auroraIndex` called, after a flush `g.aurora` exists and the legend shows "chance of aurora" and the fixture forecast clock; untick → no `g.aurora`; tick again and unmount → the document listener count returns to what it was. MapLegend: `aurora: { forecast: "…", error: null }` shows the time; `forecast: null` shows "loading"; `error: "HTTP 503"` shows it.
- [ ] **Step 2: Implement** per spec §3: `AuroraLegend` exported from `MapLegend.vue`'s script (or `src/lib/legend.ts` if the lint rule on exports from SFCs complains), the watcher, the unmount hook, the checkbox, the legend row.
- [ ] **Step 3: Run, commit** `feat(web): Aurora toggle on every map`.

### Task 3: Docs and the live check

- [ ] README and CLAUDE.md per spec §5.
- [ ] Chrome: `/earthquakes` on the dev stack, tick Aurora, the night side and bands appear over the basemap under the markers, the legend row reads the time; `/active/wc` draws nothing but the night edge; untick clears.
- [ ] Full gate, commit `docs: the aurora map layer`, push, PR link.
