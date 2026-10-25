# Section relief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw topography and bathymetry along the section from an SRTM15+ grid the server image carries, sampled by a new API route.

**Architecture:** Great-circle maths moves to `packages/shared`; the server gains a pure `geo/relief.ts`, a `relief-cli.ts` that builds the raw grid from GMT's JPEG 2000 tiles at image build time, and `GET /api/relief`; the web's `SectionProfile` fetches the relief and draws land and water fills with an axis that extends above sea level. Spec: `docs/superpowers/specs/2026-10-24-section-relief-design.md`.

**Tech Stack:** Fastify, zod, `@cornerstonejs/codec-openjpeg` (server dev dependency), Vue 3, Vitest.

## Global Constraints

- TypeScript strict, ESM, NodeNext; local imports end in `.js`. No `as` to silence nullability, no `!`. Coverage 100% on server, shared and web `src`.
- `packages/shared` has no third-party runtime deps.
- Push gate: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Commit footer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch `cross-section`.

---

### Task 1: Shared great-circle module and `ApiRelief`

- [ ] `packages/shared/src/greatcircle.ts` per the spec; export from `index.ts`; `ApiRelief` in `api.ts`.
- [ ] `packages/shared/test/greatcircle.test.ts`: `slerp([0,0],[10,0],0.5)` → `[5, 0]` (1e-9), ends exact at 0 and 1, coincident points return a, `distanceKm([0,0],[1,0])` ≈ 111.195, `toLonLat(toVec(p))` round trip for `[-122.42, 37.77]`.
- [ ] `apps/web/src/lib/section.ts` uses `slerp` for `pointAlong` and `distanceKm` for `lengthKm` (keeping its own vector helpers for the normal and projection); web tests unchanged.
- [ ] Build shared, run shared and web tests; commit `feat(shared): great-circle interpolation shared by server and web`.

### Task 2: Server relief module, CLI, route

- [ ] `pnpm --filter @tectonic/server add -D @cornerstonejs/codec-openjpeg@1.3.6`.
- [ ] `src/geo/relief.ts` per the spec, with `sampleRelief(grid, lon, lat, layout = RELIEF)` and `reliefAlong(grid, a, b, n, layout = RELIEF)` taking a layout so tests use a tiny grid. Bilinear sampling mirrors the web's `sampleLonLat` with row 0 at the north and no NaNs (the grid is complete).
- [ ] `test/geo/relief.test.ts`: box parsing (a `jP  ` signature box, an `ftyp` box, a `jp2c` box holding bytes `[1,2,3]` → those bytes; a buffer starting with the SOC marker `0xFF4F` → itself; a buffer with no `jp2c` → throws), `placeTile` on a 4×2 grid with 1×1 tiles via a 2-cell layout (use a `layout` parameter there too), `sampleRelief` cell centres and midpoints and the dateline wrap, `reliefAlong` length and `stepKm`, `loadRelief` on a temp file written with `writeFileSync` and on a missing path.
- [ ] `src/relief-cli.ts`; add `"geo:relief": "node --import tsx src/relief-cli.ts"` and exclude it from coverage in `vitest.config.ts`.
- [ ] `schemas.ts`: `reliefQuerySchema`; `routes/relief.ts`; `app.ts`: option `reliefFile`, decoration `relief`, register the route. `test/routes/relief.test.ts`: 200 with a temp 8×4 grid passed as `reliefFile` (write an `.i16` of known values in a temp dir and a matching `layout`? The route uses the real layout, so write a full-size grid? No: 7200×3600×2 = 52 MB per test is too much. Give `buildApp` a `reliefLayout` option alongside `reliefFile`, defaulting to `RELIEF`, so the test passes a 8×4 layout and a 64-byte file), 404 with `reliefFile: null`, 400 for a bad section and for `n=5000`.
- [ ] Dockerfile `RUN pnpm --filter @tectonic/server geo:relief` after the source copy; `.gitignore` entries. Run the CLI locally once to produce the grid (about 30 MB download, a minute) and check `GET /api/relief` on the dev server returns plausible metres for a Cascadia line (negative offshore, positive inland).
- [ ] Commit `feat(server): relief grid from SRTM15+ and GET /api/relief`.

### Task 3: Web relief drawing

- [ ] `api.relief`; `fakeApi` gets `relief: vi.fn().mockResolvedValue(RELIEF_FLAT)` (a 256-sample flat −3000 m). `test/lib/api.test.ts` URL assertion.
- [ ] `SectionProfile.vue`: fetch on `a`/`b` change, `aboveKm`, fills, surface, caption lines, failure note. Styles.
- [ ] Tests per the spec. Commit `feat(web): topography and bathymetry along the section`.

### Task 4: Credits, docs, gate, browser

- [ ] Footer paragraph (Tozer et al. 2019, doi:10.1029/2019EA000658), README row and bullet, CLAUDE.md. Full gate. Browser: the Cascadia section shows the trench and the arc. Commit docs, push.
