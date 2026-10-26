# Relief Tile Fetch Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The relief CLI retries a failed or stalled tile download with backoff instead of failing the image build.

**Architecture:** A tested `geo/relief-fetch.ts` module with injectable fetch, sleep and logger; the CLI calls it for a cache miss.

**Tech Stack:** TypeScript, Node fetch, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-relief-retry-design.md`.
- 100 % coverage on `apps/server/src`; no `as` to silence nullability, no `!`.
- Gate before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Branch `relief-retry`; one commit per task; messages end with the Co-Authored-By line.

---

### Task 1: `fetchTileBytes` with retry and timeout

**Files:**

- Create: `apps/server/src/geo/relief-fetch.ts`
- Test: `apps/server/test/geo/relief-fetch.test.ts`

- [ ] **Step 1:** Write the failing tests listed in the spec's Testing section, using `recordingLogger()` from `test/support/fixtures.ts` and a `vi.fn` sleep.
- [ ] **Step 2:** Run `pnpm --filter @tectonic/server test -- relief-fetch` and confirm they fail on the missing module.
- [ ] **Step 3:** Implement `TileHttpError`, `retryableTileError`, `fetchTileBytes` per the spec interface.
- [ ] **Step 4:** Tests green; `pnpm --filter @tectonic/server test:coverage` shows the module at 100 %.
- [ ] **Step 5:** Commit `feat(server): retry relief tile downloads with backoff`.

### Task 2: Wire the CLI

**Files:**

- Modify: `apps/server/src/relief-cli.ts`

- [ ] **Step 1:** Replace the inline `fetch` in `fetchTile` with `fetchTileBytes(url, { log })`, where `log` wraps `console.warn`.
- [ ] **Step 2:** Run the CLI locally against the warm cache (`pnpm --filter @tectonic/server geo:relief`) to confirm it still builds the grid, then delete one cache file and run it again to see a real download go through the new path.
- [ ] **Step 3:** Full gate, then commit `feat(server): relief CLI fetches tiles through the retrying fetch`.

### Task 3: Docs

- [ ] **Step 1:** Add a sentence to `CLAUDE.md`'s cross-section paragraph noting tile downloads retry through `geo/relief-fetch.ts`.
- [ ] **Step 2:** Commit `docs: relief tile retry`.
