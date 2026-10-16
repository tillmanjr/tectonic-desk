# Quaternary Faults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw USGS Quaternary fault traces on the West Coast map, coloured by age, with hover details, from a checked-in file produced by a generator script.

**Architecture:** A server CLI pages the USGS Qfaults ArcGIS layer, pure functions merge the pieces into fault sections and build a simplified TopoJSON, and the file is served by the existing geo route. The web app reads it with topojson-client and renders it like the plate layer.

**Tech Stack:** Node 24, Fastify, topojson-server, topojson-simplify, Vue 3, d3-geo, topojson-client, Vitest.

## Global Constraints

- TypeScript strict, ESM, `.js` import extensions, no `as` for nullability, no `!`.
- 100% coverage on `apps/server/src` and `apps/web/src`; `*-cli.ts` excluded.
- Geo files are generated, never hand-edited.
- Spec: `docs/superpowers/specs/2026-10-16-quaternary-faults-design.md`.

---

### Task 1: Server qfaults functions

**Files:**

- Create: `apps/server/src/geo/qfaults.ts`
- Create: `apps/server/test/geo/qfaults.test.ts`
- Create: `apps/server/test/fixtures/usgs/qfaults-page.json` (trimmed real page, ~6 features incl. one MultiLineString, one blank section, one class B, one inferred)
- Modify: `apps/server/package.json` (deps `topojson-server`, `topojson-simplify`; devDeps `@types/topojson-server`, `@types/topojson-simplify`, `@types/topojson-specification`, `@types/geojson`)

**Interfaces (Produces):**

```ts
export type AgeCode = "historic" | "latest" | "late" | "mid" | "undiff" | "other";
export type Cert = "well" | "mod" | "inf";
export interface FaultProps {
  id: string;
  name: string;
  section: string | null;
  age: AgeCode;
  cert: Cert;
  rate: string | null;
  sense: string | null;
  dip: string | null;
  url: string | null;
}
export interface QfaultPiece {
  type: "Feature";
  geometry: LineString | MultiLineString;
  properties: Record<string, unknown>;
}
export function parseSymbology(s: unknown): { age: AgeCode; cert: Cert };
export function mergeTraces(pieces: QfaultPiece[]): Feature<MultiLineString, FaultProps>[];
export function faultTopology(
  features: Feature<MultiLineString, FaultProps>[],
  opts?: { quantization?: number; minWeight?: number },
): Topology;
```

- [ ] Write failing tests: symbology parsing table; merge groups two pieces of one section into one MultiLineString with rounded coordinates and nulls for blanks; a MultiLineString piece contributes all its lines; topology has object `faults`, `arcs` count, and a collinear midpoint is dropped at minWeight 1e-7.
- [ ] Implement; `pnpm --filter @tectonic/server test:coverage` green.
- [ ] Commit `feat(server): qfaults merge and topology functions`.

### Task 2: Generator CLI, data file, asset name

**Files:**

- Create: `apps/server/src/qfaults-cli.ts`
- Modify: `apps/server/vitest.config.ts` (exclude `src/qfaults-cli.ts`), `apps/server/package.json` (script `geo:qfaults`), `apps/server/src/geo/assets.ts` (`"wc-qfaults"`), `apps/server/data/geo/README.md`
- Generate: `apps/server/data/geo/wc-qfaults.json`

- [ ] CLI: page with `fetch`, 2000 a page, stop when `exceededTransferLimit` is absent/false; merge; topology; write; print counts and size. Tune `minWeight` so the file is under 2 MB.
- [ ] Run it; check the server assets test and `GET /api/geo/wc-qfaults` in dev.
- [ ] Commit `feat(server): serve West Coast Quaternary faults`.

### Task 3: Web geo library

**Files:**

- Modify: `apps/web/src/lib/api.ts` (`GeoName`), `apps/web/src/lib/geo.ts`
- Create: `apps/web/test/support/faults.ts` (tiny topology with 2 faults)
- Modify: `apps/web/test/lib/geo.test.ts`

- [ ] Tests: `faultFeatures` returns typed features; `faultTitle` joins present parts, "Dip vertical" lowercases "Vertical", drops blanks.
- [ ] Implement `FAULT_AGES`, `FAULT_DASH`, `faultFeatures`, `faultTitle`.
- [ ] Commit `feat(web): quaternary fault reader and age table`.

### Task 4: MapFaults component, map toggle, legend, footer, styles

**Files:**

- Create: `apps/web/src/components/MapFaults.vue`, `apps/web/test/components/MapFaults.test.ts`
- Modify: `QuakeMap.vue`, `MapLegend.vue`, `App.vue`, `styles.css`, `QuakeMap.test.ts`, `MapLegend.test.ts`, `App.test.ts`, `test/support/api.ts` (geo mock returns the faults topology for `wc-qfaults`)

- [ ] Tests first: MapFaults renders 2 features, hover emits title and sets `.hot`, leave clears; QuakeMap shows the checkbox only in WC, calls `api.geo("wc-qfaults")` once across toggles and region round trips, hover shows the tip, failed load logs; legend swatches only with `faults`; footer text.
- [ ] Implement; CSS vars `--qf-*` in light and dark; `.legend .qf` swatches.
- [ ] Chrome check on the dev stack: Bay Area zoom, hover a trace, toggle off.
- [ ] Commit `feat(web): Quaternary faults layer on the West Coast view`.

### Task 5: Docs

- [ ] README, CLAUDE.md, memory roadmap.
- [ ] Commit `docs: quaternary faults`.
