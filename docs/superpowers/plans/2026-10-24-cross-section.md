# Cross-section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Section` tool draws a line on the map; a profile panel plots the corridor's hypocentres by depth against distance along it, true scale by default, with the section kept in the route.

**Architecture:** Pure geometry in `src/lib/section.ts`; the tool's state machine in `src/lib/section-tool.ts`, created by `useMapView` from injected `SECTION`/`SET_SECTION`; `MapSection.vue` in the layers slot; `SectionProfile.vue` on the Earthquakes and Active Earth pages; `App.vue` owns the `section` query key. Spec: `docs/superpowers/specs/2026-10-24-cross-section-design.md`.

**Tech Stack:** Vue 3, d3-geo (`geoPath` for the corridor and line), d3-scale, Vitest 5 with happy-dom.

## Global Constraints

- TypeScript strict, ESM, NodeNext; local imports end in `.js`. No `as` to silence nullability, no `!`.
- Coverage 100% on `apps/web/src`. Components never touch the router.
- Push gate: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Commit footer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch `cross-section`.

---

### Task 1: Geometry (`section.ts`)

**Files:** Create `apps/web/src/lib/section.ts`; test `apps/web/test/lib/section.test.ts`.

- [ ] Test first. Known values: one degree of longitude on the equator is 111.195 km (R = 6371); the great-circle distance from San Francisco (−122.42, 37.77) to Los Angeles (−118.24, 34.05) is about 559 km with initial bearing about 137°.

```ts
import { describe, expect, it } from "vitest";
import {
  azimuth,
  azimuthText,
  corridorRing,
  DEFAULT_HALF_KM,
  lengthKm,
  parseSection,
  pointAlong,
  profileOf,
  projectOnto,
  sectionQuery,
  surfacePointsOf,
  type Section,
} from "../../src/lib/section.js";
import { event } from "../support/events.js";
import { volcano } from "../support/volcanoes.js";

const eq: Section = { a: [0, 0], b: [10, 0], halfKm: 50 };
const sfla: Section = { a: [-122.42, 37.77], b: [-118.24, 34.05], halfKm: 50 };

describe("section query", () => {
  it("parses five numbers and rejects junk, out-of-range widths and a zero-length line", () => {
    expect(parseSection("-122.42,37.77,-118.24,34.05,50")).toEqual(sfla);
    expect(parseSection("1,2,3,4")).toBeNull();
    expect(parseSection("a,b,c,d,e")).toBeNull();
    expect(parseSection("0,0,10,0,2")).toBeNull();
    expect(parseSection("0,0,10,0,900")).toBeNull();
    expect(parseSection("0,0,0,0,50")).toBeNull();
    expect(parseSection("0,95,10,0,50")).toBeNull();
    expect(parseSection(undefined)).toBeNull();
    expect(parseSection(["1,2,3,4,5"])).toBeNull();
  });
  it("writes three decimals for the ends and none for the width, round-tripping", () => {
    const s: Section = { a: [-122.4194, 37.7749], b: [-118.2437, 34.0522], halfKm: 50.4 };
    expect(sectionQuery(s)).toBe("-122.419,37.775,-118.244,34.052,50");
    expect(parseSection(sectionQuery(s))).toEqual({
      a: [-122.419, 37.775],
      b: [-118.244, 34.052],
      halfKm: 50,
    });
  });
});

describe("length and azimuth", () => {
  it("measures great circles and initial bearings", () => {
    expect(lengthKm(eq)).toBeCloseTo(1111.95, 0);
    expect(azimuth(eq)).toBeCloseTo(90, 5);
    expect(azimuth({ ...eq, b: [0, 10] })).toBeCloseTo(0, 5);
    expect(lengthKm(sfla)).toBeCloseTo(559, -1);
    expect(azimuth(sfla)).toBeCloseTo(137, -1);
    expect(azimuthText(84)).toBe("N 84° E");
    expect(azimuthText(137)).toBe("S 43° E");
    expect(azimuthText(225)).toBe("S 45° W");
    expect(azimuthText(300)).toBe("N 60° W");
    expect(azimuthText(0)).toBe("N 0° E");
    expect(azimuthText(360)).toBe("N 0° E");
  });
});

describe("projectOnto", () => {
  it("gives along and signed off distances, right of A→A′ positive", () => {
    const on = projectOnto(eq, 5, 0);
    expect(on.alongKm).toBeCloseTo(555.97, 0);
    expect(on.offKm).toBeCloseTo(0, 5);
    const south = projectOnto(eq, 5, -1);
    expect(south.offKm).toBeCloseTo(111.19, 0);
    const north = projectOnto(eq, 5, 1);
    expect(north.offKm).toBeCloseTo(-111.19, 0);
    expect(projectOnto(eq, -2, 0).alongKm).toBeCloseTo(-222.39, 0);
    expect(projectOnto(eq, 12, 0).alongKm).toBeCloseTo(1334.34, 0);
  });
});

describe("profileOf and surfacePointsOf", () => {
  it("keeps corridor events with a depth, in order along the line, and counts the rest", () => {
    const evs = [
      event({ id: "far", longitude: 5, latitude: 2, depthKm: 10 }),
      event({ id: "mid", longitude: 6, latitude: 0.2, depthKm: 30 }),
      event({ id: "near", longitude: 2, latitude: -0.3, depthKm: 10 }),
      event({ id: "nodepth", longitude: 4, latitude: 0, depthKm: null }),
      event({ id: "before", longitude: -1, latitude: 0, depthKm: 10 }),
      event({ id: "after", longitude: 11, latitude: 0, depthKm: 10 }),
    ];
    const p = profileOf(eq, evs);
    expect(p.points.map((x) => x.id)).toEqual(["near", "mid"]);
    expect(p.points[0]?.depthKm).toBe(10);
    expect(p.points[1]?.alongKm).toBeCloseTo(667.17, 0);
    expect(p.noDepth).toBe(1);
    const vs = [
      volcano({ number: 1, name: "On", lon: 3, lat: 0.1 }),
      volcano({ number: 2, name: "Off", lon: 3, lat: 3 }),
    ];
    expect(surfacePointsOf(eq, vs)).toEqual([
      { number: 1, name: "On", alongKm: expect.closeTo(333.6, 0) },
    ]);
  });
});

describe("corridorRing and pointAlong", () => {
  it("runs from A to A′ and offsets symmetrically", () => {
    expect(pointAlong(eq, 0).map((v) => Number(v.toFixed(6)))).toEqual([0, 0]);
    expect(pointAlong(eq, 1).map((v) => Number(v.toFixed(6)))).toEqual([10, 0]);
    expect(pointAlong(eq, 0.5)[0]).toBeCloseTo(5, 5);
    const ring = corridorRing(eq);
    expect(ring).toHaveLength(67);
    expect(ring[0]).toEqual(ring[66]);
    const lats = ring.map(([, lat]) => lat);
    expect(Math.max(...lats)).toBeCloseTo(0.4497, 3);
    expect(Math.min(...lats)).toBeCloseTo(-0.4497, 3);
  });
});
```

(`event()` and `volcano()` fixtures take `Partial` overrides; check the field names `latitude`/`longitude` on `ApiEvent` and `lat`/`lon` on `Volcano`.)

- [ ] Implement with unit vectors (`toVec`, `toLonLat`, `cross`, `dot`, `norm`), `R = 6371`. `parseSection` splits on commas, needs exactly five finite numbers, lat within ±90, lon within ±180, half within `HALF_KM_RANGE`, A ≠ A′. `azimuth` from the standard formula `atan2(sin Δλ cos φ2, cos φ1 sin φ2 − sin φ1 cos φ2 cos Δλ)`. `azimuthText`: for `d` in [0,360): if `d <= 90` → `N d E`; `< 180` → `S (180−d) E`; `<= 270` → `S (d−180) W`; else `N (360−d) W`; round to integer. `projectOnto` as the spec's vector formulas, with `offKm` sign positive to the right of travel: compute `n = norm(cross(a, b))`, `off = asin(dot(p, n))` — check the sign against the test (a point south of an eastward line is to the right, so `offKm` must be positive there; flip `n` if needed). `corridorRing`: left side t = 0..1 (33 points), right side t = 1..0 (33 points), then the first point again → 67 points. `profileOf` sorts points by `alongKm`.
- [ ] Run, lint, typecheck; commit `feat(web): great-circle section geometry`.

---

### Task 2: Route, keys and the tool

**Files:** Modify `src/lib/keys.ts`, `src/components/App.vue`, `test/support/mount.ts`, `test/components/App.test.ts`; create `src/lib/section-tool.ts`, `test/lib/section-tool.test.ts`.

- [ ] Keys: `SECTION: InjectionKey<Readonly<Ref<Section | null>>>`, `SET_SECTION: InjectionKey<(s: Section | null) => void>`. App: `routeSection = computed(() => parseSection(route.query.section))`, `provide(SECTION, routeSection)`, `setSection(s)` replaces the query (`section: s === null ? undefined : sectionQuery(s)`), `provide(SET_SECTION, setSection)`. mount.ts: `section: ref<Section | null>(null)`, `setSection: vi.fn()`, provided.
- [ ] App test: mount at `/earthquakes/wc?section=-122.42,37.77,-118.24,34.05,50` with a Probe stub (as the existing SELECT probe does) that reads `SECTION` and calls `SET_SECTION(null)` on mount; expect the ref to hold the parsed section and the route to lose the key.
- [ ] Tool test, then implement per the spec interface:

```ts
describe("section tool", () => {
  function make() {
    const section = ref<Section | null>(null);
    const set = vi.fn((s: Section | null) => { section.value = s; });
    return { section, set, tool: useSectionTool(section, set) };
  }
  it("arms, places two points and commits with the default width", () => {
    const { tool, set } = make();
    tool.place([1, 1]); // not armed: ignored
    expect(set).not.toHaveBeenCalled();
    tool.toggle();
    expect(tool.armed.value).toBe(true);
    tool.place([0, 0]);
    expect(tool.pending.value).toEqual([0, 0]);
    tool.hover([3, 0]);
    expect(tool.cursor.value).toEqual([3, 0]);
    tool.place([0, 0]); // same point: ignored
    expect(set).not.toHaveBeenCalled();
    tool.place([10, 0]);
    expect(set).toHaveBeenCalledWith({ a: [0, 0], b: [10, 0], halfKm: DEFAULT_HALF_KM });
    expect(tool.armed.value).toBe(false);
    expect(tool.pending.value).toBeNull();
    expect(tool.cursor.value).toBeNull();
  });
  it("cancels a pending point on toggle or cancel, and hover is ignored when idle", () => { ... });
  it("drags a handle through a draft and commits once on end", () => {
    const { tool, set, section } = make();
    section.value = { a: [0, 0], b: [10, 0], halfKm: 50 };
    tool.dragMove([5, 5]); // no drag in progress: ignored
    tool.dragStart("b");
    tool.dragMove([12, 1]);
    expect(tool.shown.value).toEqual({ a: [0, 0], b: [12, 1], halfKm: 50 });
    expect(set).not.toHaveBeenCalled();
    tool.dragEnd();
    expect(set).toHaveBeenCalledWith({ a: [0, 0], b: [12, 1], halfKm: 50 });
    tool.dragEnd(); // idempotent
    expect(set).toHaveBeenCalledTimes(1);
  });
  it("clears and clamps the half-width", () => { ... setHalfKm(1) → 5, setHalfKm(1000) → 500, setHalfKm(80) → 80; setHalfKm with no section is ignored; clear() → set(null) });
});
```

Semantics: `place` ignores a second point equal to the first; `dragEnd` with a draft whose ends coincide drops the draft instead of committing. `shown` is the draft while dragging, else `section`.

- [ ] Commit `feat(web): section in the route and the drawing tool`.

---

### Task 3: Map layer, toolbar button, pointer wiring

**Files:** Create `src/components/MapSection.vue`; modify `src/lib/mapview.ts` (options `section`, `setSection`; `tool = useSectionTool(...)` exported as `section`; `invertPointer(ev)`; the Escape listener while armed; `lastDown` for the click-after-pan check; `onMapClick`), `src/components/MapShell.vue` (tool button, `@pointerdown`/`@click` on the svg, `MapSection` after the layers slot so it sits on top), `QuakeMap.vue` and `CombinedMap.vue` (inject `SECTION`/`SET_SECTION`, pass to `useMapView`), `src/styles.css`; tests in `test/components/QuakeMap.test.ts` (+ `MapSection` assertions) and `test/lib/mapview` where pointer helpers are tested (`test/components/QuakeMap.test.ts` covers `useMapView` today).

Pointer details: `invertPointer(ev)` = `projection.invert(projectedPointer(ev))` or null. `onMapDown(ev)` records `{x: ev.clientX, y: ev.clientY}`. `onMapClick(ev)`: if `!section.armed` return; if the last down is more than 3 px away return; `const ll = invertPointer(ev); if (ll) section.place(ll)`. `onMapMove` additionally calls `section.hover(invertPointer(ev))` while armed. Handles in `MapSection.vue` call `emit("dragStart", end)`, `emit("dragMove", ev)`, `emit("dragEnd")` and the shell wires them to the tool with `mv.invertPointer`. The Escape listener: `watch(section.armed, (on) => on ? document.addEventListener("keydown", onEsc) : remove)`, removed on unmount.

In tests, `svgEl.getBoundingClientRect()` returns zeros under happy-dom; `projectedPointer` already copes (`rect.width || frame.width`). Clicks at `clientX/Y` then map 1:1 to frame units: a click at (500, 260) on the global frame inverts to a lon/lat near the frame centre. Use `trigger("pointerdown", { clientX, clientY })` then `trigger("click", { clientX, clientY })` with matching coordinates, and a mismatched pair to assert the pan guard.

- [ ] Tests: the toolbar button toggles `aria-pressed`; two click pairs commit via `ctx.setSection` with two distinct lon/lat points and `halfKm: 50`; Escape while armed disarms; with `ctx.section.value` set, the layer renders `.corridor`, `.sline`, two `.handle`, labels `A` and `A′`; pointerdown on the second handle, pointermove on the svg at new coordinates, pointerup commits a section whose `b` changed; a click after a 10 px pan does not place.
- [ ] Commit `feat(web): section line, corridor and handles on the map`.

---

### Task 4: Profile panel

**Files:** Create `src/components/SectionProfile.vue`, `test/components/SectionProfile.test.ts`; modify `EarthquakesPage.vue`, `ActiveEarthPage.vue` (render after the map, `v-if="section !== null"`, Active Earth with `volcanoes`), `src/styles.css`; page tests if they assert the component list.

- [ ] Follow the spec's layout constants and data computation. Tests with `makeContext()` (one event at −175.1452, −18.723, depth per `event()`; add events through `fakeApi({ events: … })` as the CatalogTable test does, with lon/lat along a short equator line) for: title text, tick counts, true-scale height (`H` for a 1111 km line with a 100 km deepest event: `plotH = 100 / (1111.95 / 840) = 75.5`, so `H = MIN_H = 140` applies), ×4, the deep cutoff caption, the no-depth caption, click selects (`ctx.select`), half-width input calls `setSection` with the new width, Clear calls `setSection(null)`, volcano triangles with `volcanoes: true` and `makeContext({ volcanoes: true })` plus a volcano fixture on the line.
- [ ] Commit `feat(web): section profile panel`.

---

### Task 5: Docs, gate, browser check

- [ ] README **Cross-section** bullet; CLAUDE.md bullet. Full gate. Browser: draw a Cascadia section on `/earthquakes/wc`, drag a handle, change width and exaggeration, check `/active/wc` volcanoes; screenshot. Commit docs, push, PR link.
