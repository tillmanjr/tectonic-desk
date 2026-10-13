# Subduction Teeth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw subduction teeth on the overriding side of every PB2002 subduction step, name the polarity in the tooltip, with a toolbar toggle.

**Architecture:** A pure geometry module turns a projected polyline into tooth path data; a small SVG layer renders one path per segment; `plateFeature` derives the polarity from Bird's `/` and `\` titles. No API or data change.

**Tech Stack:** as the front end (Vue 3, Vitest, happy-dom).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-13-subduction-teeth-design.md`.
- 100% coverage on `apps/web/src`; lint, typecheck, format clean at every commit.
- Commit format: `git -c core.safecrlf=false commit --trailer "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "..."`.

---

### Task 1: Geometry and polarity

**Files:** create `apps/web/src/lib/teeth.ts`, `apps/web/test/lib/teeth.test.ts`; modify `apps/web/src/lib/geo.ts`, `apps/web/test/lib/geo.test.ts`.

- [ ] Write `teeth.test.ts` (polarity; seven teeth on a 100-unit line at k=1 with apex y=−6 left / +6 right; k=16 spacing; 500-unit step skipped; null break and zero-length step; empty input).
- [ ] Implement `teeth.ts` with `polarity` and `teethPath` as in the spec.
- [ ] Extend `geo.ts`: `PLATE_NAMES`, `plateName`, `teeth` flag on classes, `overriding` in `PlateProps`, the sentence in `plateFeature`. Extend `geo.test.ts`.
- [ ] Verify: `pnpm --filter @tectonic/web test:coverage`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
- [ ] Commit: `feat(web): subduction polarity and teeth geometry`.

### Task 2: Layer, toggle, legend, docs

**Files:** create `apps/web/src/components/MapTeeth.vue`, `apps/web/test/components/MapTeeth.test.ts`; modify `QuakeMap.vue`, `MapLegend.vue`, their tests, `test/support/events.ts` (a `PA/NA` subduction segment), `README.md`, `apps/server/data/geo/README.md`, `CLAUDE.md`.

- [ ] Write `MapTeeth.test.ts` (one path per eligible segment, none for a hyphen-titled sub step, path changes with k).
- [ ] Implement `MapTeeth.vue`; wire `showTeeth` checkbox and `plateSegments` in `QuakeMap.vue`; legend teeth.
- [ ] Update tests and docs.
- [ ] Verify as above; commit: `feat(web): subduction teeth layer with toggle and legend`.

### Task 3: Chrome check

- [ ] `pnpm dev`, open http://localhost:5173, confirm teeth on the Pacific margins pointing landward (Japan, Aleutians, Andes), the West Coast view's Cascadia teeth pointing east, the toggle, the tooltip sentence, and no console errors. Stop the dev stack.
