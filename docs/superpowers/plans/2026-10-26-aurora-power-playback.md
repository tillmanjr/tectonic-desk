# Aurora Power Row and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hemispheric power as a seventh row of the Space stack, a Play button on the aurora scrub, and a marker on the stack at the frame on show.

**Architecture:** Two new series ids flow through the existing samples table, window read and row model. Playback is a timer loop inside the aurora store that reuses its select-and-show path and prefetches ahead. The stack reads the aurora store for the marker.

**Tech Stack:** TypeScript, Fastify, Drizzle, Vue 3, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-aurora-power-playback-design.md`.
- 100 % coverage on `apps/server/src`, `packages/shared/src`, `apps/web/src`; no `as` to silence nullability, no `!`.
- Gate before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Branch `aurora-power-playback`; one commit per task; messages end with the Co-Authored-By line.

---

### Task 1: The two series, server side

**Files:**

- Modify: `packages/shared/src/space.ts` (`SPACE_SERIES`, `seriesRecord`)
- Modify: `apps/server/src/space/parse.ts` (add `hemiPowerSamples`)
- Modify: `apps/server/src/ingest/space.ts` (`syncAurora` upserts the samples)
- Test: `apps/server/test/space/parse.test.ts`, `apps/server/test/repositories/space.test.ts`, `apps/server/test/routes/space.test.ts`

**Interfaces:**

- Produces: `hemiPowerSamples(rows: HemiPowerRow[]): SpaceSample[]`; series ids `hp_north`, `hp_south`.

- [ ] **Step 1: Add the ids.** In `SPACE_SERIES` after `p100`:

```ts
  /** OVATION Prime's hemispheric power, GW, at the forecast time: north. */
  "hp_north",
  /** South. */
  "hp_south",
```

and `hp_north: fill("hp_north"), hp_south: fill("hp_south"),` in `seriesRecord`.

- [ ] **Step 2: Failing test.** In `parse.test.ts`'s hemispheric power test:

```ts
expect(hemiPowerSamples(rows)).toEqual([
  { series: "hp_north", time: new Date("2026-10-25T13:20:00Z"), source: "ovation", value: 18 },
  { series: "hp_south", time: new Date("2026-10-25T13:20:00Z"), source: "ovation", value: 17 },
  { series: "hp_north", time: new Date("2026-10-25T13:30:00Z"), source: "ovation", value: 20 },
  { series: "hp_south", time: new Date("2026-10-25T13:30:00Z"), source: "ovation", value: 19 },
]);
```

(Check the fixture: only rows with four parseable fields count.)

- [ ] **Step 3: Implement** in `parse.ts`:

```ts
/** Two samples per row, at the forecast time, so the power reads beside Kp and Dst. */
export function hemiPowerSamples(rows: HemiPowerRow[]): SpaceSample[] {
  return rows.flatMap((r) => [
    { series: "hp_north", time: r.forecast, source: "ovation", value: r.north },
    { series: "hp_south", time: r.forecast, source: "ovation", value: r.south },
  ]);
}
```

- [ ] **Step 4: Job.** In `syncAurora`, after `insertAuroraFrame`: `await upsertSamples(ctx.db, hemiPowerSamples(power));`. Job test: `latest.hp_north` is `{ time 2026-10-25T13:30Z, value 20, source "ovation" }`. Routes test: the window answer lists `hp_north` points when seeded.

- [ ] **Step 5: Run** `pnpm --filter @tectonic/server test`, `pnpm --filter @tectonic/shared test`; fix the web typecheck fallout (fixtures) in Task 2.

- [ ] **Step 6: Commit** `feat(server): hemispheric power as two series at the forecast time`.

### Task 2: The stack row

**Files:**

- Modify: `apps/web/src/lib/space-chart.ts` (`RowId`, `ROWS`, `CADENCE_MS`)
- Modify: `apps/web/src/components/SpaceStack.vue` (`SHORT`)
- Modify: `apps/web/src/styles.css` (tokens `--sw-hp`, `--sw-hp-south`; `.sline.hp_north`, `.sline.hp_south`)
- Modify: `apps/web/test/support/space.ts` (fixtures)
- Test: `apps/web/test/lib/space-chart.test.ts`, `apps/web/test/components/SpaceStack.test.ts`, `SpacePage.test.ts`

- [ ] **Step 1: Fixtures.** `spaceNow.latest`: `hp_north: reading(19.5, "ovation")`, `hp_south: reading(18.1, "ovation")`. `spaceWindow.samples`: `hp_north: pointsEnding(300_000, [12, 14, 19, 21, 19.5])`, `hp_south: pointsEnding(300_000, [11, 13, 17, 19, 18.1])`.
- [ ] **Step 2: Failing tests.** `space-chart.test.ts`: ids `["kp", "dst", "power", "mag", "wind", "xray", "protons"]`; `byId.power.domain([12, 19.5])` equals `spanAtLeast([12, 19.5], 0, 40)`. `SpaceStack.test.ts`: seven row classes with `power` third; `.sline.hp_north` and `.sline.hp_south` paths exist; the readout shows the pair. Row counts 6 → 7 in `SpaceStack.test.ts:172`.
- [ ] **Step 3: Implement** the row spec from the design, `CADENCE_MS` entries, `SHORT` `hp_north: "N"`, `hp_south: "S"`, styles.
- [ ] **Step 4: Run** the web suite; **Commit** `feat(web): hemispheric power row in the Space stack`.

### Task 3: Playback

**Files:**

- Modify: `apps/web/src/lib/aurora.ts`
- Modify: `apps/web/src/components/SpaceAurora.vue`
- Modify: `apps/web/src/styles.css` (`.scrub button` spacing if needed)
- Test: `apps/web/test/lib/aurora.test.ts`, `apps/web/test/components/SpaceAurora.test.ts`

**Interfaces:**

- Produces: `AuroraStore.playing: Ref<boolean>`, `play(): void`, `pause(): void`, `PLAY_STRIDE = 6`, `PLAY_STEP_MS = 200`, `GRID_CACHE = 160`.

- [ ] **Step 1: Failing tests** (fake timers, `framedApi(20)` style fixture with 20 frames): play from live selects frame 6, 12, 18, then null at 19 with `playing` false; each step 200 ms after its grid; prefetch of frame 12 happens while 6 shows (`api.auroraFrame` call order); `select("…")` by the user while playing sets `playing` false; `stop()` pauses; `play()` with one frame does nothing.
- [ ] **Step 2: Implement** per the design: `playing` ref, `stepTimer`, `playStep(i)`, `prefetch(meta)` (`void gridOf(meta).catch(() => undefined)`), `pause()`, `play()`; the public `select` calls `pause()` first; `stop()` and hidden pause.
- [ ] **Step 3: Button** in `SpaceAurora.vue`: `<button type="button" :disabled="last < 1" :aria-pressed="store.playing.value" @click="store.playing.value ? store.pause() : store.play()">{{ store.playing.value ? "Pause" : "Play" }}</button>`.
- [ ] **Step 4: Run**, **Commit** `feat(web): play through the aurora frames`.

### Task 4: The marker

**Files:**

- Modify: `apps/web/src/components/SpaceStack.vue`, `apps/web/src/styles.css` (`.aumark`)
- Test: `apps/web/test/components/SpaceStack.test.ts`

- [ ] **Step 1: Failing test.** With `ctx.aurora.selected.value = "x"` and `ctx.aurora.frame.value = { …auroraMeta, forecast inside the window, grid }`, `line.aumark` exists at `x(forecast)`; selected null → none; forecast before `from` → none.
- [ ] **Step 2: Implement** `const aurora = useInjected(AURORA)` and the `marker` computed; draw the line before the cross group.
- [ ] **Step 3: Run**, **Commit** `feat(web): mark the aurora frame's time on the stack`.

### Task 5: Docs and the live check

- [ ] README and CLAUDE.md per the spec §5.
- [ ] Chrome: `/space` on the dev stack, the power row after Dst, Play runs and ends live, the marker appears while scrubbing.
- [ ] Full gate, **Commit** `docs: the power row, playback and marker`, push, PR link.
