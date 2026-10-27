# Sun Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven latest Sun frames (SDO and SOHO) as a strip on the Space page, each opening large in an overlay, proxied and cached by the server.

**Architecture:** A shared catalogue names the frames. The server keeps an in-memory cache per frame and size, refreshed on demand with a five-minute lifetime, and serves a manifest plus the bytes. The web reads the manifest with the space store's poll and draws the strip and the overlay from it.

**Tech Stack:** TypeScript, Fastify, Vue 3, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-sun-images-design.md`.
- 100 % coverage on all three packages; no `as` to silence nullability, no `!`; local imports end in `.js`.
- Gate before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Branch `sun-images`; one commit per task; messages end with the Co-Authored-By line.

---

### Task 1: The catalogue

**Files:** create `packages/shared/src/sun.ts`, export from `packages/shared/src/index.ts`; add `ApiSunFrames` to `packages/shared/src/api.ts`; test `packages/shared/test/sun.test.ts`.

**Produces:** `SUN_FRAMES`, `SunKey`, `SUN_SIZES = [512, 1024]`, `SunSize`, `isSunKey`, `isSunSize`, `SUN_CREDIT`, `sunFrame(key)`, `SunFrameMeta { key; time: Date | null; bytes: number }`, `ApiSunFrames { generatedAt: string; frames: Json<SunFrameMeta>[] }`.

- [ ] Test: seven keys in strip order, every frame has a title, note and source; `isSunKey("c2")`, `isSunKey("c4")` false; `isSunSize(1024)`, `isSunSize(256)` false; `SUN_CREDIT.sdo` contains "NASA/SDO"; `sunFrame("hmib").title` is "HMI magnetogram".
- [ ] Implement; `pnpm --filter @tectonic/shared test`; commit `feat(shared): the Sun frame catalogue`.

### Task 2: The server cache

**Files:** create `apps/server/src/space/sun.ts`; test `apps/server/test/space/sun.test.ts`.

**Produces:**

```ts
export const SDO_BASE = "https://sdo.gsfc.nasa.gov/assets/img/latest/";
export const SOHO_BASE = "https://soho.nascom.nasa.gov/data/realtime/";
export function sunUrl(key: SunKey, size: SunSize): string;
export interface SunImage {
  bytes: Buffer;
  contentType: string;
  lastModified: Date | null;
  fetchedAt: Date;
}
export interface SunCacheOptions {
  fetch?: typeof fetch;
  userAgent: string;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
  log?: Pick<IngestLogger, "warn">;
}
export interface SunCache {
  get: (key: SunKey, size: SunSize) => Promise<SunImage>;
  metas: () => Promise<SunFrameMeta[]>;
}
export function createSunCache(opts: SunCacheOptions): SunCache;
```

- [ ] Tests with an injected fetch returning `new Response(bytes, { headers: { "content-type": "image/jpeg", "last-modified": "Tue, 27 Oct 2026 02:43:06 GMT" } })`: URL per key and size (`latest_512_0193.jpg`, `latest_1024_HMIIC.jpg`, `latest_512_HMIB.jpg`, `c2/512/latest.jpg`), user-agent header, a second `get` inside the ttl makes no fetch, one past it does, two concurrent cold `get`s share one fetch, a 503 after a good copy returns the stale copy and warns, a 503 with no copy throws `SpaceHttpError`, a missing `last-modified` gives null, `metas()` returns seven entries in catalogue order with times and byte counts, the timeout aborts.
- [ ] Implement; commit `feat(server): cached Sun frames from SDO and SOHO`.

### Task 3: Routes and wiring

**Files:** create `apps/server/src/routes/sun.ts`; modify `apps/server/src/app.ts` (`AppOptions.sun?: SunCache`, default `createSunCache({ userAgent })` needs an agent: take `sunUserAgent?: string` defaulting to "tectonic-desk/0.0 (+local)", decorate `app.sun`), `apps/server/src/index.ts` (pass `createSunCache({ userAgent: config.USGS_USER_AGENT, log: app.log })`); test `apps/server/test/routes/sun.test.ts` (no Docker: `db = {} as unknown as Db` like relief).

- [ ] Tests: `GET /api/space/sun` → `{ generatedAt, frames: [{ key, time, bytes }] }`, `cache-control: public, max-age=60`; `GET /api/space/sun/aia193/512.jpg` → 200, `content-type: image/jpeg`, `last-modified`, `cache-control: public, max-age=3600`, body bytes equal; `/api/space/sun/aia999/512.jpg` and `/api/space/sun/c2/256.jpg` → 404; upstream failure with no copy → 502 `{ error: "sun frame unavailable" }`; the route's rate limit config is 600.
- [ ] Implement; commit `feat(server): Sun frame routes`.

### Task 4: Web client and store

**Files:** `apps/web/src/lib/api.ts` (`sunFrames()`, `sunImageUrl(key, size, time)` → `/api/space/sun/<key>/<size>.jpg?t=<encoded time or "0">`), `apps/web/src/lib/space.ts` (`sun: ShallowRef<ApiSunFrames | null>`, `loadSun()` called from `load()` with its own catch), test support (`apps/web/test/support/space.ts` `sunFrames()` fixture, `fakeApi` answers), tests `apps/web/test/lib/api.test.ts`, `apps/web/test/lib/space.test.ts`.

- [ ] Tests: URL builder; `load()` fills `sun`; a rejecting `sunFrames` leaves `error` null and `sun` as it was.
- [ ] Implement; commit `feat(web): Sun frames in the space store`.

### Task 5: Strip and overlay

**Files:** create `apps/web/src/components/SunStrip.vue`, `apps/web/src/components/SunOverlay.vue`; modify `apps/web/src/components/SpacePage.vue` (strip between tiles and alerts, overlay at the end), `apps/web/src/styles.css`; tests `apps/web/test/components/SunStrip.test.ts`, `SunOverlay.test.ts`, `SpacePage.test.ts`.

- [ ] Strip: `<p class="sectionlabel">The Sun · SDO and SOHO</p>` then `<section class="sunstrip">` of seven `<button type="button" class="sunthumb">` with `<img :src loading="lazy" :alt>`, `<span class="t">title</span>`, `<span class="m">HH:MM UTC</span>` (`fmtClock`); emits `open(key)`; "No frames yet." note while `sun` is null.
- [ ] Overlay: props `open: SunKey | null`, emits `update:open`; `<div class="sunoverlay" role="dialog" aria-modal="true" :aria-label>` with backdrop click closing, `×` button focused on open, `<img>` 1024, caption lines, filmstrip buttons (`.on` for the open one), keydown Escape / ArrowLeft / ArrowRight on the dialog (and a window listener while open), `document.body.style.overflow = "hidden"` while open and restored on close/unmount.
- [ ] Tests: strip renders seven with times and alt text, click emits; overlay renders the caption and credit per source, arrows wrap around, filmstrip click, Escape closes, backdrop click closes, body overflow restored; page test sees the strip and opens the overlay.
- [ ] Commit `feat(web): the Sun strip and overlay`.

### Task 6: Credits, docs, check

- [ ] Footer paragraph and README credits rows for SDO and SOHO; README page paragraph; CLAUDE.md space weather bullet.
- [ ] Full gate; Chrome check on the dev stack (strip, overlay, keys, phone width); commit `docs: credits for the Sun frames`; push.
