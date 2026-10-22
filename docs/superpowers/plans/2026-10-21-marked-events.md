# Marked Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reader mark the view they are in from either detail panel, keep the marks in the browser, group them, reopen any one, and lay a group's panels out at once in an overlay.

**Architecture:** A `marks.ts` store (localStorage, parsed field by field) is provided by `App.vue` under `MARKS`, beside a `MarksNav` object under `MARKS_NAV` that is the only thing touching the router. The two side panels split into header plus body components so `MarksOverlay` can stack the bodies. Thumbnails reuse the map's basemap loaders through a new shared cache.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, d3-geo, vitest + @vue/test-utils, TypeScript strict.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-marked-events-design.md`. Terms come from `MARK_TERMS`; no other copy of the words `Mark`, `Marks`, `Marked events`, `Groups`, `All`.
- No `as` casts to silence nullability, no `!` assertions; typescript-eslint strict and `vue/no-mutating-props` apply. Components never import the router: they use the injected `MARKS_NAV`.
- Coverage thresholds are 100 % on `apps/web/src`; every branch added needs a test.
- No browser dialogs (`confirm`, `alert`, `prompt`).
- Storage reads and writes are wrapped in try/catch; a failure yields an empty store or a change that applies for this page only.
- Full gate before each commit: from `apps/web`, `npx vitest run --coverage`; from the repo root, `pnpm -s lint`, `pnpm -s typecheck`, `npx prettier --check apps/web README.md CLAUDE.md docs`, `pnpm -s build`.
- One PR, one commit per task, on branch `marked-events`.

---

### Task 1: The marks store

**Files:**

- Create: `apps/web/src/lib/marks.ts`
- Modify: `apps/web/src/lib/keys.ts` (add `MARKS`, `MARKS_NAV`)
- Test: `apps/web/test/lib/marks.test.ts`

**Interfaces:**

- Produces: everything in spec section 1 (`Mark`, `MarkGroup`, `MarkDraft`, `MarkSubject`, `MarkView`, `MarkKind`, `ThumbFrame`, `MARKS_KEY`, `ALL_GROUP`, `MARK_TERMS`, `NAME_MAX`, `parseMarks`, `defaultName`, `createMarks`, `MarksStore`) and the `MarksNav` interface in `keys.ts` (section 2).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/lib/marks.test.ts
import { describe, expect, it } from "vitest";
import {
  ALL_GROUP,
  createMarks,
  defaultName,
  MARKS_KEY,
  parseMarks,
  type MarkDraft,
} from "../../src/lib/marks.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/wc?event=us1",
  frame: "wc",
  lon: -122.1,
  lat: 37.4,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};
const volcano: MarkDraft = { ...quake, kind: "volcano", ref: "211060", name: "Etna", stamp: null };

function memory(seed: string | null = null) {
  const store = new Map<string, string>();
  if (seed !== null) store.set(MARKS_KEY, seed);
  return {
    store,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}
function deps() {
  let n = 0;
  return { id: () => `id${String(++n)}`, now: () => new Date("2026-10-21T12:00:00Z") };
}

describe("marks", () => {
  it("parses a document, dropping malformed marks, foreign ids and an 'all' group", () => {
    const good = { ...quake, id: "a", createdAt: "2026-10-21T00:00:00.000Z" };
    const doc = {
      v: 1,
      marks: [good, { ...good, id: "b", lon: "x" }, { ...good, id: "c", kind: "comet" }, 7],
      groups: [
        { id: "g1", name: "Pacific", marks: ["a", "zzz"] },
        { id: "all", name: "nope", marks: [] },
        { id: 3 },
      ],
    };
    const parsed = parseMarks(JSON.stringify(doc));
    expect(parsed.marks.map((m) => m.id)).toEqual(["a"]);
    expect(parsed.groups).toEqual([{ id: "g1", name: "Pacific", marks: ["a"] }]);
    expect(parseMarks(null)).toEqual({ marks: [], groups: [] });
    expect(parseMarks("nope")).toEqual({ marks: [], groups: [] });
    expect(parseMarks("[]")).toEqual({ marks: [], groups: [] });
  });

  it("names a subject from its headline and place", () => {
    expect(defaultName(quake)).toBe("M5.5 mww · 10 km N of Somewhere");
  });

  it("adds newest first, renames with trimming, and removes across groups", () => {
    const m = memory();
    const s = createMarks(m.storage, deps());
    const a = s.add(quake);
    const b = s.add(volcano);
    expect(s.marks.value.map((x) => x.id)).toEqual(["id2", "id1"]);
    expect(a.createdAt).toBe("2026-10-21T12:00:00.000Z");
    s.rename(a.id, "  Renamed  ");
    expect(s.marks.value[1]?.name).toBe("Renamed");
    s.rename(a.id, "   ");
    expect(s.marks.value[1]?.name).toBe("M5.5 mww");
    s.rename(a.id, "x".repeat(200));
    expect(s.marks.value[1]?.name).toHaveLength(120);
    s.rename("nope", "ignored");
    const g = s.addGroup("Pacific");
    s.setMember(a.id, g.id, true);
    s.setMember(b.id, g.id, true);
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([b.id, a.id]);
    s.remove(a.id);
    expect(s.marks.value.map((x) => x.id)).toEqual([b.id]);
    expect(s.groups.value[0]?.marks).toEqual([b.id]);
    expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({ v: 1 });
    expect(s.countFor("volcano", "211060")).toBe(1);
    expect(s.countFor("event", "us1")).toBe(0);
  });

  it("manages groups, membership and views", () => {
    const s = createMarks(null, deps());
    const a = s.add(quake);
    const g = s.addGroup("   ");
    expect(g.name).toBe("Group 1");
    s.renameGroup(g.id, "Cascadia");
    expect(s.groups.value[0]?.name).toBe("Cascadia");
    s.setMember(a.id, g.id, true);
    s.setMember(a.id, g.id, true);
    expect(s.groups.value[0]?.marks).toEqual([a.id]);
    expect(s.groupsOf(a.id).map((x) => x.id)).toEqual([g.id]);
    s.setMember(a.id, ALL_GROUP, false);
    s.setMember(a.id, "nope", true);
    s.setMember("nope", g.id, true);
    expect(s.view(ALL_GROUP)).toMatchObject({ id: "all", name: "All", virtual: true });
    expect(s.view(ALL_GROUP)?.marks).toHaveLength(1);
    expect(s.view(g.id)).toMatchObject({ virtual: false, name: "Cascadia" });
    expect(s.view("nope")).toBeNull();
    s.setMember(a.id, g.id, false);
    expect(s.groupsOf(a.id)).toEqual([]);
    s.renameGroup("nope", "x");
    s.removeGroup(g.id);
    s.removeGroup("nope");
    expect(s.groups.value).toEqual([]);
  });

  it("reads a seeded document and survives storage that throws", () => {
    const seeded = memory(
      JSON.stringify({
        v: 1,
        marks: [{ ...quake, id: "k", createdAt: "2026-10-01T00:00:00.000Z" }],
        groups: [],
      }),
    );
    expect(createMarks(seeded.storage).marks.value[0]?.id).toBe("k");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const s = createMarks(broken, deps());
    expect(s.marks.value).toEqual([]);
    expect(() => s.add(quake)).not.toThrow();
    expect(s.marks.value).toHaveLength(1);
    const real = createMarks(null);
    const m1 = real.add(quake);
    const m2 = real.add(quake);
    expect(m1.id).not.toBe(m2.id);
    expect(m1.createdAt).toMatch(/^\d{4}-/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `npx vitest run test/lib/marks.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/marks.js`.

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/marks.ts
import { ref, type Ref } from "vue";

export type MarkKind = "event" | "volcano";
export type ThumbFrame = "world" | "wc";

export interface Mark {
  id: string;
  kind: MarkKind;
  ref: string;
  name: string;
  /** Path and query of the view as marked, overlay keys removed. */
  url: string;
  frame: ThumbFrame;
  lon: number;
  lat: number;
  headline: string;
  sub: string;
  stamp: string | null;
  createdAt: string;
}
export interface MarkGroup {
  id: string;
  name: string;
  marks: string[];
}
export type MarkDraft = Omit<Mark, "id" | "createdAt">;
/** What a panel knows about its subject; the button adds `name` and `url`. */
export type MarkSubject = Omit<MarkDraft, "name" | "url">;
export interface MarkView {
  id: string;
  name: string;
  virtual: boolean;
  marks: Mark[];
}

export const MARKS_KEY = "tectonic.marks";
export const ALL_GROUP = "all";
export const MARK_TERMS = {
  verb: "Mark",
  noun: "Marks",
  title: "Marked events",
  group: "Group",
  groups: "Groups",
  all: "All",
} as const;
export const NAME_MAX = 120;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isKind = (v: unknown): v is MarkKind => v === "event" || v === "volcano";
const isFrame = (v: unknown): v is ThumbFrame => v === "world" || v === "wc";
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseMark(v: unknown): Mark | null {
  if (!isRecord(v)) return null;
  const { id, kind, ref, name, url, frame, lon, lat, headline, sub, stamp, createdAt } = v;
  if (!isStr(id) || !isKind(kind) || !isStr(ref) || !isStr(name) || !isStr(url)) return null;
  if (!isFrame(frame) || !isNum(lon) || !isNum(lat) || !isStr(headline) || !isStr(sub)) return null;
  if (!(isStr(stamp) || stamp === null) || !isStr(createdAt)) return null;
  return { id, kind, ref, name, url, frame, lon, lat, headline, sub, stamp, createdAt };
}

/** The stored document; malformed marks and groups are dropped rather than failing the whole read. */
export function parseMarks(raw: string | null): { marks: Mark[]; groups: MarkGroup[] } {
  let parsed: unknown = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const root = isRecord(parsed) ? parsed : {};
  const marks = (Array.isArray(root.marks) ? root.marks : [])
    .map(parseMark)
    .filter((m): m is Mark => m !== null);
  const known = new Set(marks.map((m) => m.id));
  const groups: MarkGroup[] = [];
  for (const g of Array.isArray(root.groups) ? root.groups : []) {
    if (!isRecord(g) || !isStr(g.id) || !isStr(g.name) || !Array.isArray(g.marks)) continue;
    if (g.id === ALL_GROUP) continue;
    groups.push({ id: g.id, name: g.name, marks: g.marks.filter((m) => isStr(m) && known.has(m)) });
  }
  return { marks, groups };
}

/** The name offered for a subject before the reader edits it. */
export const defaultName = (s: MarkSubject): string => `${s.headline} · ${s.sub}`;

const cleanName = (name: string, fallback: string): string => {
  const t = name.trim().slice(0, NAME_MAX);
  return t === "" ? fallback : t;
};
const randomId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface MarksStore {
  marks: Readonly<Ref<Mark[]>>;
  groups: Readonly<Ref<MarkGroup[]>>;
  add(draft: MarkDraft): Mark;
  rename(id: string, name: string): void;
  remove(id: string): void;
  addGroup(name: string): MarkGroup;
  renameGroup(id: string, name: string): void;
  removeGroup(id: string): void;
  setMember(markId: string, groupId: string, member: boolean): void;
  view(groupId: string): MarkView | null;
  countFor(kind: MarkKind, ref: string): number;
  groupsOf(markId: string): MarkGroup[];
}

interface Deps {
  id: () => string;
  now: () => Date;
}

function readRaw(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(MARKS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The reader's marked views and groups, persisted in localStorage; `storage: null` keeps them in memory. */
export function createMarks(
  storage: StorageLike | null = localStorage,
  deps: Deps = { id: randomId, now: () => new Date() },
): MarksStore {
  const initial = parseMarks(readRaw(storage));
  const marks = ref<Mark[]>(initial.marks);
  const groups = ref<MarkGroup[]>(initial.groups);
  function persist(): void {
    try {
      storage?.setItem(
        MARKS_KEY,
        JSON.stringify({ v: 1, marks: marks.value, groups: groups.value }),
      );
    } catch {
      // storage full or disabled; the change still applies for this page
    }
  }
  const find = (id: string): Mark | undefined => marks.value.find((m) => m.id === id);
  const findGroup = (id: string): MarkGroup | undefined => groups.value.find((g) => g.id === id);
  return {
    marks,
    groups,
    add(draft) {
      const mark: Mark = {
        ...draft,
        name: cleanName(draft.name, draft.headline),
        id: deps.id(),
        createdAt: deps.now().toISOString(),
      };
      marks.value = [mark, ...marks.value];
      persist();
      return mark;
    },
    rename(id, name) {
      const m = find(id);
      if (m === undefined) return;
      m.name = cleanName(name, m.headline);
      persist();
    },
    remove(id) {
      marks.value = marks.value.filter((m) => m.id !== id);
      for (const g of groups.value) g.marks = g.marks.filter((m) => m !== id);
      persist();
    },
    addGroup(name) {
      const g: MarkGroup = {
        id: deps.id(),
        name: cleanName(name, `${MARK_TERMS.group} ${String(groups.value.length + 1)}`),
        marks: [],
      };
      groups.value = [...groups.value, g];
      persist();
      return g;
    },
    renameGroup(id, name) {
      const g = findGroup(id);
      if (g === undefined) return;
      g.name = cleanName(name, g.name);
      persist();
    },
    removeGroup(id) {
      groups.value = groups.value.filter((g) => g.id !== id);
      persist();
    },
    setMember(markId, groupId, member) {
      const g = findGroup(groupId);
      if (g === undefined || find(markId) === undefined) return;
      const has = g.marks.includes(markId);
      if (member && !has) g.marks = [...g.marks, markId];
      else if (!member && has) g.marks = g.marks.filter((m) => m !== markId);
      else return;
      persist();
    },
    view(groupId) {
      if (groupId === ALL_GROUP) {
        return { id: ALL_GROUP, name: MARK_TERMS.all, virtual: true, marks: marks.value };
      }
      const g = findGroup(groupId);
      if (g === undefined) return null;
      const set = new Set(g.marks);
      return {
        id: g.id,
        name: g.name,
        virtual: false,
        marks: marks.value.filter((m) => set.has(m.id)),
      };
    },
    countFor: (kind, r) => marks.value.filter((m) => m.kind === kind && m.ref === r).length,
    groupsOf: (markId) => groups.value.filter((g) => g.marks.includes(markId)),
  };
}
```

Note: `rename` mutates a mark inside a `ref` array; Vue's deep reactivity on `ref<Mark[]>` tracks it. `renameGroup`'s empty-name fallback keeps the old name (spec: "replaced by … `Group N`" applies to creation).

- [ ] **Step 4: Add the keys**

In `apps/web/src/lib/keys.ts` add the imports and keys:

```ts
import type { MarksStore } from "./marks.js";

export interface MarksNav {
  /** The current route's path and query without `marks` and `show`: what a new mark saves. */
  viewUrl: Readonly<Ref<string>>;
  /** The overlay state the route asks for; null when closed. */
  overlay: Readonly<Ref<{ group: string; panels: boolean } | null>>;
  open(group?: string): void;
  show(group: string): void;
  list(group: string): void;
  close(): void;
  goTo(url: string): void;
}
export const MARKS: InjectionKey<MarksStore> = Symbol("marks");
export const MARKS_NAV: InjectionKey<MarksNav> = Symbol("marksNav");
```

- [ ] **Step 5: Run the test and the gate, then commit**

Run: `npx vitest run test/lib/marks.test.ts` → PASS. Then the full gate (marks.ts must be at 100 %; the `rename` of the `randomId`/`now` defaults is covered by the last test).

```bash
git add apps/web/src/lib/marks.ts apps/web/src/lib/keys.ts apps/web/test/lib/marks.test.ts
git commit -m "feat(web): marks store for marked views and groups"
```

---

### Task 2: Basemap cache and thumbnails

**Files:**

- Create: `apps/web/src/lib/basemap-cache.ts`, `apps/web/src/lib/thumb.ts`, `apps/web/src/components/MarkThumb.vue`
- Modify: `apps/web/src/lib/mapview.ts` (drop `worldTopo`, `regionCache`; `loadBasemap` uses the cache; `resetMapCaches` calls `resetBasemapCache`)
- Modify: `apps/web/src/styles.css` (`.thumb`)
- Test: `apps/web/test/lib/basemap-cache.test.ts`, `apps/web/test/lib/thumb.test.ts`, `apps/web/test/components/MarkThumb.test.ts`

**Interfaces:**

- Consumes: `ThumbFrame`, `MarkKind` from Task 1; `Basemap`, `loadWorld`, `worldBasemap`, `regionBasemap`, `Topo` from `geo.ts`.
- Produces: `loadBasemapFor(api, region): Promise<Basemap>`, `resetBasemapCache()`, `THUMB`, `thumbProjection(frame, bbox)`, `outlinePath(basemap, projection)`, `starPath(cx, cy, r)`, `MarkThumb` props `{ lon, lat, frame, kind }`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/lib/basemap-cache.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBasemapFor, resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { fakeApi } from "../support/api.js";
import { stubWorld } from "../support/world.js";

const global = { id: "global", name: "Global", subtitle: "", minMag: 4.5, days: 7, bbox: null };
const wc = {
  ...global,
  id: "wc",
  bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
};

describe("basemap cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetBasemapCache();
  });
  it("fetches each basemap once, sharing the in-flight promise, until reset", async () => {
    stubWorld();
    const api = fakeApi();
    const [a, b] = await Promise.all([loadBasemapFor(api, global), loadBasemapFor(api, global)]);
    expect(a).toBe(b);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const r1 = await loadBasemapFor(api, wc);
    const r2 = await loadBasemapFor(api, wc);
    expect(r1).toBe(r2);
    expect(vi.mocked(api.geo)).toHaveBeenCalledWith("wc-land");
    expect(vi.mocked(api.geo).mock.calls.filter(([n]) => n === "wc-land")).toHaveLength(1);
    resetBasemapCache();
    await loadBasemapFor(api, global);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
  it("forgets a failed load so the next call retries", async () => {
    stubWorld(false);
    const api = fakeApi();
    await expect(loadBasemapFor(api, global)).rejects.toThrow("503");
    stubWorld();
    await expect(loadBasemapFor(api, global)).resolves.toBeDefined();
  });
});
```

```ts
// apps/web/test/lib/thumb.test.ts
import { describe, expect, it } from "vitest";
import { outlinePath, starPath, THUMB, thumbProjection } from "../../src/lib/thumb.js";

const bbox = { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 };
const square = {
  land: {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [-120, 30],
              [-110, 30],
              [-110, 40],
              [-120, 40],
              [-120, 30],
            ],
          ],
        },
      },
    ],
  },
  borders: { type: "MultiLineString" as const, coordinates: [] },
};

describe("thumb", () => {
  it("fits the world and the West Coast into the thumb box", () => {
    const world = thumbProjection("world", null);
    const p = world([0, 0]);
    expect(p?.[0]).toBeGreaterThan(0);
    expect(p?.[0]).toBeLessThan(THUMB.width);
    const wc = thumbProjection("wc", bbox);
    const q = wc([-120, 40]);
    expect(q?.[0]).toBeGreaterThan(0);
    expect(q?.[1]).toBeLessThan(THUMB.height);
    // a wc frame without a bbox falls back to the world projection
    expect(thumbProjection("wc", null)([0, 0])).toEqual(world([0, 0]));
  });
  it("renders the land to one path and draws a five-point star", () => {
    const d = outlinePath(square, thumbProjection("wc", bbox));
    expect(d.startsWith("M")).toBe(true);
    expect(starPath(10, 10, 5).split("L")).toHaveLength(10);
    expect(starPath(10, 10, 5).endsWith("Z")).toBe(true);
  });
});
```

```ts
// apps/web/test/components/MarkThumb.test.ts
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkThumb from "../../src/components/MarkThumb.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("MarkThumb", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetBasemapCache();
  });
  it("draws the star at once and the outline when the basemap arrives", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(MarkThumb, ctx, { lon: -120, lat: 40, frame: "world", kind: "event" });
    expect(w.find("path.star").exists()).toBe(true);
    expect(w.find("path.land").exists()).toBe(false);
    await flushPromises();
    expect(w.find("path.land").attributes("d")).toMatch(/^M/);
    w.unmount();
  });
  it("uses the regional outline for the West Coast frame and colours volcanoes", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(MarkThumb, ctx, { lon: -122, lat: 45, frame: "wc", kind: "volcano" });
    await flushPromises();
    expect(vi.mocked(ctx.api.geo)).toHaveBeenCalledWith("wc-land");
    expect(w.find("path.star").attributes("style")).toContain("--vc-recent");
    w.unmount();
  });
  it("draws no star for a point the projection cannot place, and no outline on failure", async () => {
    stubWorld(false);
    const ctx = await makeContext();
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = mountWith(MarkThumb, ctx, { lon: 30, lat: 0, frame: "world", kind: "event" });
    await flushPromises();
    expect(w.find("path.land").exists()).toBe(false);
    expect(err).toHaveBeenCalled();
    w.unmount();
  });
});
```

The "cannot place" case: Natural Earth projects every point, so cover the null branch by mounting with `frame: "wc"` and a point behind the conic's clip? Conic conformal also returns a point for most inputs. Use `lat: 95` (invalid latitude yields NaN coordinates; treat `!Number.isFinite` as unplaceable) and assert `path.star` is absent.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lib/basemap-cache.test.ts test/lib/thumb.test.ts test/components/MarkThumb.test.ts` → FAIL, modules missing.

- [ ] **Step 3: Write the cache and move mapview onto it**

```ts
// apps/web/src/lib/basemap-cache.ts
import type { ApiRegion } from "@tectonic/shared";
import type { ApiClient } from "./api.js";
import { loadWorld, regionBasemap, worldBasemap, type Basemap, type Topo } from "./geo.js";

const pending = new Map<string, Promise<Basemap>>();

/** The basemap for a region, fetched once per key (`world` for regions without a bbox) and shared while in flight. */
export function loadBasemapFor(api: ApiClient, region: ApiRegion): Promise<Basemap> {
  const key = region.bbox === null ? "world" : region.id;
  const hit = pending.get(key);
  if (hit !== undefined) return hit;
  const p = (async (): Promise<Basemap> => {
    if (region.bbox === null) return worldBasemap(await loadWorld());
    const [land, states] = await Promise.all([api.geo("wc-land"), api.geo("wc-states")]);
    return regionBasemap(land as Topo, states as Topo);
  })();
  pending.set(key, p);
  p.catch(() => pending.delete(key));
  return p;
}

/** Drops the cache; for tests. */
export function resetBasemapCache(): void {
  pending.clear();
}
```

(The two `as Topo` casts already exist in `mapview.ts` for the untyped geo payload; move them, do not add new ones.)

In `mapview.ts`: delete `let worldTopo` and `const regionCache`; make `resetMapCaches` call `resetBasemapCache()` (keep whatever else it resets); replace the body of `loadBasemap` with:

```ts
async function loadBasemap(r: ApiRegion): Promise<void> {
  const token = ++loadSeq;
  basemap.value = null;
  try {
    const b = await loadBasemapFor(api, r);
    if (token === loadSeq) basemap.value = b;
  } catch (e) {
    console.error("basemap failed to load", e);
  }
}
```

Remove the now-unused imports (`loadWorld`, `worldBasemap`, `regionBasemap`, maybe `Topo`) from `mapview.ts`.

- [ ] **Step 4: Write the thumb library**

```ts
// apps/web/src/lib/thumb.ts
import type { Bbox } from "@tectonic/shared";
import { geoConicConformal, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Basemap } from "./geo.js";
import type { ThumbFrame } from "./marks.js";

export const THUMB = { width: 96, height: 56 } as const;
const INSET = 2;
const EXTENT: [[number, number], [number, number]] = [
  [INSET, INSET],
  [THUMB.width - INSET, THUMB.height - INSET],
];

/** The projection a thumbnail draws with: the world, or the bbox of the West Coast preset. */
export function thumbProjection(frame: ThumbFrame, bbox: Bbox | null): GeoProjection {
  if (frame === "world" || bbox === null) {
    return geoNaturalEarth1().rotate([-150, 0]).fitExtent(EXTENT, { type: "Sphere" });
  }
  const span = bbox.maxLat - bbox.minLat;
  return geoConicConformal()
    .parallels([bbox.minLat + span / 4, bbox.maxLat - span / 4])
    .rotate([-(bbox.minLon + bbox.maxLon) / 2, 0])
    .clipExtent([
      [0, 0],
      [THUMB.width, THUMB.height],
    ])
    .fitExtent(EXTENT, {
      type: "MultiPoint",
      coordinates: [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.minLat],
        [bbox.minLon, bbox.maxLat],
        [bbox.maxLon, bbox.maxLat],
      ],
    });
}

/** The land of a basemap as one SVG path string. */
export function outlinePath(basemap: Basemap, projection: GeoProjection): string {
  return geoPath(projection)(basemap.land) ?? "";
}

/** A five-point star centred on (cx, cy) with outer radius r. */
export function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}
```

Check `Bbox` is exported from `@tectonic/shared` (`grep -n "Bbox" packages/shared/src/index.ts`); if its name differs, use that name.

- [ ] **Step 5: Write the component**

```vue
<!-- apps/web/src/components/MarkThumb.vue -->
<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { loadBasemapFor } from "../lib/basemap-cache.js";
import { API, CATALOG, useInjected } from "../lib/keys.js";
import type { MarkKind, ThumbFrame } from "../lib/marks.js";
import { outlinePath, starPath, THUMB, thumbProjection } from "../lib/thumb.js";

/** A 96 × 56 schematic of the world or the West Coast with a star at the marked event. */
const props = defineProps<{ lon: number; lat: number; frame: ThumbFrame; kind: MarkKind }>();
const api = useInjected(API);
const catalog = useInjected(CATALOG);

const wcRegion = computed(
  () => catalog.regions.value.find((r) => r.id === "wc" && r.bbox !== null) ?? null,
);
const projection = computed(() =>
  thumbProjection(props.frame, props.frame === "wc" ? (wcRegion.value?.bbox ?? null) : null),
);
const star = computed(() => {
  const p = projection.value([props.lon, props.lat]);
  if (p === null || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return starPath(p[0], p[1], 5);
});
const land = shallowRef<string | null>(null);
watch(
  [() => props.frame, wcRegion],
  async ([frame, wc]) => {
    land.value = null;
    const region =
      frame === "wc" && wc !== null ? wc : catalog.regions.value.find((r) => r.bbox === null);
    if (region === undefined) return;
    try {
      const b = await loadBasemapFor(api, region);
      land.value = outlinePath(b, projection.value);
    } catch (e) {
      console.error("thumbnail basemap failed to load", e);
    }
  },
  { immediate: true },
);
const fill = computed(() => (props.kind === "event" ? "var(--accent)" : "var(--vc-recent)"));
</script>

<template>
  <svg
    class="thumb"
    :viewBox="`0 0 ${String(THUMB.width)} ${String(THUMB.height)}`"
    aria-hidden="true"
  >
    <path v-if="land !== null" class="land" :d="land" />
    <path v-if="star !== null" class="star" :d="star" :style="{ fill }" />
  </svg>
</template>
```

If `catalog.regions` holds no global region in some test context, the `region === undefined` branch needs a test: `makeContext` always loads both regions from `fakeApi`, so cover it by mounting with `ctx.catalog.regions.value = []` before mount in the failure test.

Styles (`styles.css`):

```css
.thumb {
  width: 96px;
  height: 56px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
}
.thumb .land {
  fill: var(--muted);
  fill-opacity: 0.35;
  stroke: none;
}
.thumb .star {
  stroke: var(--ink);
  stroke-width: 0.8;
}
```

- [ ] **Step 6: Run the tests and the gate, then commit**

Run the three test files, then `npx vitest run --coverage` (the map tests must still pass with the shared cache; `resetMapCaches` is called in their `afterEach`). Lint, typecheck, Prettier, build.

```bash
git add apps/web/src/lib/basemap-cache.ts apps/web/src/lib/thumb.ts apps/web/src/components/MarkThumb.vue apps/web/src/lib/mapview.ts apps/web/src/styles.css apps/web/test
git commit -m "feat(web): shared basemap cache and location thumbnails"
```

---

### Task 3: Panel bodies, the Mark button and the nav

**Files:**

- Create: `apps/web/src/components/EventDetailBody.vue`, `apps/web/src/components/VolcanoDetailBody.vue`, `apps/web/src/components/MarkButton.vue`
- Modify: `apps/web/src/components/DetailPanel.vue`, `apps/web/src/components/VolcanoDetail.vue`, `apps/web/src/components/App.vue` (store, nav, header button), `apps/web/test/support/mount.ts` (context gains `marks` and `nav`), `apps/web/src/styles.css` (`.markrow`)
- Test: `apps/web/test/components/MarkButton.test.ts`; additions to `DetailPanel.test.ts`, `VolcanoDetail.test.ts`, `App.test.ts`

**Interfaces:**

- Consumes: `MarksStore`, `MarkSubject`, `defaultName`, `MARK_TERMS` (Task 1); `MarksNav`, `MARKS`, `MARKS_NAV` (keys).
- Produces: `EventDetailBody` props `{ id: string }`, emits `loaded(detail: ApiEventDetail | null)`; `VolcanoDetailBody` props `{ number: number }`; `MarkButton` props `{ subject: MarkSubject | null }`; `App.vue` provides `MARKS` and `MARKS_NAV`; `mount.ts` `Context` gains `marks: MarksStore` and `nav: MarksNav` whose functions are `vi.fn()` and whose `viewUrl` is `ref("/wc?event=us1")`, `overlay` is `ref(null)`.

- [ ] **Step 1: Extend the test context**

In `apps/web/test/support/mount.ts`: import `createMarks`, `MARKS`, `MARKS_NAV`, `type MarksNav`; add to `Context` `marks: MarksStore; nav: MarksNav & { overlay: Ref<{ group: string; panels: boolean } | null> }` (keep the writable ref so tests can open the overlay); in `makeContext` return `marks: createMarks(null)` and

```ts
    nav: {
      viewUrl: ref("/wc?event=us1"),
      overlay: ref<{ group: string; panels: boolean } | null>(null),
      open: vi.fn(),
      show: vi.fn(),
      list: vi.fn(),
      close: vi.fn(),
      goTo: vi.fn(),
    },
```

and in `mountWith` `provide(MARKS, ctx.marks); provide(MARKS_NAV, ctx.nav);`.

- [ ] **Step 2: Write the failing MarkButton test**

```ts
// apps/web/test/components/MarkButton.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MarkButton from "../../src/components/MarkButton.vue";
import type { MarkSubject } from "../../src/lib/marks.js";
import { makeContext, mountWith } from "../support/mount.js";

const subject: MarkSubject = {
  kind: "event",
  ref: "us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};

describe("MarkButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("is disabled without a subject", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject: null });
    expect(w.find("button.mark").attributes("disabled")).toBeDefined();
    expect(w.find("button.mark").text()).toBe("☆ Mark");
    w.unmount();
  });
  it("names and saves a mark of the current view, then shows the filled star", async () => {
    vi.useFakeTimers();
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject });
    await w.find("button.mark").trigger("click");
    const input = w.find("input");
    expect((input.element as HTMLInputElement).value).toBe("M5.5 mww · 10 km N of Somewhere");
    await input.setValue("My shock");
    const stop = vi.fn();
    await input.trigger("keydown", { key: "Enter", stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(ctx.marks.marks.value[0]).toMatchObject({
      name: "My shock",
      url: "/wc?event=us1",
      kind: "event",
      ref: "us1",
    });
    expect(w.find("button.mark").text()).toBe("★ Mark");
    expect(w.find("button.mark").attributes("title")).toBe("Marked once");
    expect(w.find(".flash").text()).toBe("Marked");
    vi.advanceTimersByTime(2100);
    await nextTick();
    expect(w.find(".flash").exists()).toBe(false);
    ctx.marks.add({ ...subject, name: "again", url: "/" });
    await nextTick();
    expect(w.find("button.mark").attributes("title")).toBe("Marked 2 times");
    w.unmount();
  });
  it("cancels on Escape and Cancel without closing the panel, and saves on the Save button", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject });
    await w.find("button.mark").trigger("click");
    const stop = vi.fn();
    await w.find("input").trigger("keydown", { key: "Escape", stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(w.find("input").exists()).toBe(false);
    await w.find("button.mark").trigger("click");
    await w.find("input").trigger("keydown", { key: "a" });
    await w.find("button.cancel").trigger("click");
    expect(w.find("input").exists()).toBe(false);
    await w.find("button.mark").trigger("click");
    await w.find("button.save").trigger("click");
    expect(ctx.marks.marks.value).toHaveLength(1);
    w.unmount();
  });
});
```

Note `(input.element as HTMLInputElement)`: casts are banned in `src`, tests already use them for DOM elements (check `grep -rn "as HTML" apps/web/test | head -1`; if none, use `w.find<HTMLInputElement>("input").element.value`, which is the typed form test-utils offers).

- [ ] **Step 3: Write MarkButton**

```vue
<!-- apps/web/src/components/MarkButton.vue -->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { MARKS, MARKS_NAV, useInjected } from "../lib/keys.js";
import { defaultName, MARK_TERMS, type MarkSubject } from "../lib/marks.js";

/** The row under a panel header that names and saves a mark of the current view. */
const props = defineProps<{ subject: MarkSubject | null }>();
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);
const FLASH_MS = 2000;

const naming = ref(false);
const name = ref("");
const flash = ref(false);
const input = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

const count = computed(() =>
  props.subject === null ? 0 : store.countFor(props.subject.kind, props.subject.ref),
);
const title = computed(() =>
  count.value === 0
    ? `${MARK_TERMS.verb} this view`
    : count.value === 1
      ? "Marked once"
      : `Marked ${String(count.value)} times`,
);

async function begin(): Promise<void> {
  if (props.subject === null) return;
  name.value = defaultName(props.subject);
  naming.value = true;
  await nextTick();
  input.value?.select();
}
function cancel(): void {
  naming.value = false;
}
function save(): void {
  if (props.subject === null) return;
  store.add({ ...props.subject, name: name.value, url: nav.viewUrl.value });
  naming.value = false;
  flash.value = true;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    flash.value = false;
    timer = null;
  }, FLASH_MS);
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.stopPropagation();
    save();
  } else if (e.key === "Escape") {
    e.stopPropagation();
    cancel();
  }
}
onUnmounted(() => {
  if (timer !== null) clearTimeout(timer);
});
</script>

<template>
  <div class="markrow">
    <template v-if="naming">
      <input
        ref="input"
        v-model="name"
        type="text"
        :maxlength="120"
        aria-label="Name for this mark"
        @keydown="onKey"
      />
      <button type="button" class="save" @click="save">Save</button>
      <button type="button" class="cancel" @click="cancel">Cancel</button>
    </template>
    <template v-else>
      <button
        type="button"
        class="mark"
        :class="{ marked: count > 0 }"
        :disabled="subject === null"
        :title="title"
        @click="begin"
      >
        {{ count > 0 ? "★" : "☆" }} {{ MARK_TERMS.verb }}
      </button>
      <span v-if="flash" class="flash">Marked</span>
    </template>
  </div>
</template>
```

`save()` with a null subject cannot happen through the UI (the button is disabled, and `naming` is only set by `begin`), so drop that guard if coverage flags it; instead compute the subject inside `begin` and keep it in a ref so `save` reads `pending.value`. Simplest for coverage: `const pending = ref<MarkSubject | null>(null)`; `begin` sets it; `save` does `if (pending.value === null) return;` — still a branch. Prefer: `save` takes the subject from `props.subject ?? pending`? Keep one guard and cover it with a test that calls `begin`, then sets the prop to null via `w.setProps({ subject: null })`, then presses Enter and asserts nothing was added.

Styles:

```css
.detail .markrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--line);
  font: 13px var(--f-ui);
}
.detail .markrow input {
  flex: 1;
  min-width: 0;
  font: 13px var(--f-ui);
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
  color: var(--ink);
}
.detail .markrow button {
  font: 13px var(--f-ui);
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
}
.detail .markrow button.mark.marked {
  color: var(--accent);
}
.detail .markrow button:disabled {
  opacity: 0.5;
  cursor: default;
}
.detail .markrow .flash {
  color: var(--muted);
}
```

- [ ] **Step 4: Split the panels**

`EventDetailBody.vue`: move from `DetailPanel.vue` the imports it needs (`faultingStyle`, `planesOf`, types, `MechanismBlock`, `ApiRequestError`, `errorMessage`, depth helpers, format helpers, `parentOf`, `sequenceOf`, `preferredMechanism`), the `ImpactRow` interface, `detail`, `loading`, `notFound`, `error`, `seq`, `current`, `load`, `retry`, `derived`, `describe`, `otherZone`, and the template from `<p v-if="loading">` to the USGS link, wrapped in `<div class="panelbody">`. Props `{ id: string }`; `const emit = defineEmits<{ loaded: [detail: ApiEventDetail | null] }>()`; `watch(() => props.id, (id) => { void load(id); }, { immediate: true })`; in `load`, `emit("loaded", null)` at the start and `emit("loaded", d)` on success.

`DetailPanel.vue` keeps: injections of `CATALOG` and `SELECT`, `const detail = shallowRef<ApiEventDetail | null>(null)`, `open`, `head = computed(() => detail.value ?? catalog.selected.value)`, `close`, Escape listener, and a new

```ts
const subject = computed<MarkSubject | null>(() => {
  const h = head.value;
  if (h === null) return null;
  return {
    kind: "event",
    ref: h.id,
    frame: catalog.region.value?.bbox === null || catalog.region.value === null ? "world" : "wc",
    lon: h.longitude,
    lat: h.latitude,
    headline: `M${fmtMag(h.mag, true)} ${h.magType ?? ""}`.trim(),
    sub: placeOf(h),
    stamp: h.time,
  };
});
```

(`h.time` is an ISO string on the DTO; confirm with `grep -n "time" packages/shared/src/api.ts`.) Template: header unchanged; then `<MarkButton :subject="subject" />`; then

```vue
<div class="bd">
      <EventDetailBody
        v-if="catalog.selectedId.value !== null"
        :id="catalog.selectedId.value"
        @loaded="(d) => (detail = d)"
      />
    </div>
```

When the selection clears, the body unmounts and `detail` must reset: add `watch(catalog.selectedId, (id) => { if (id === null) detail.value = null; })`.

`VolcanoDetailBody.vue`: props `{ number: number }`; `const v = computed(() => store.byNumber.value.get(props.number) ?? null)`; move `detail`, `loading`, `error`, `seq`, `load` (watching `() => props.number` immediately), `eruptions = computed(() => store.eruptionsFor(props.number))`, `strip`, `W`, `STRIP_FROM`, `gvpUrl`, and the template from `<template v-if="v !== null">` through the "not in the Holocene catalogue" note (now `<p v-else class="note">Volcano {{ number }} is not …</p>`), wrapped in `<div class="panelbody">`.

`VolcanoDetail.vue` keeps `open`, `v = store.selected`, `close`, the header, then `<MarkButton :subject="subject" />` with

```ts
const subject = computed<MarkSubject | null>(() => {
  const x = v.value;
  if (x === null) return null;
  return {
    kind: "volcano",
    ref: String(x.number),
    frame: store.region.value?.bbox === null || store.region.value === null ? "world" : "wc",
    lon: x.lon,
    lat: x.lat,
    headline: x.name,
    sub: `${x.country} · ${x.region}`,
    stamp: null,
  };
});
```

and `<div class="bd"><VolcanoDetailBody v-if="store.selectedNumber.value !== null" :number="store.selectedNumber.value" /></div>`.

Run `npx vitest run test/components/DetailPanel.test.ts test/components/VolcanoDetail.test.ts` after the split: they must pass unchanged. Then add to each one assertion:

```ts
await w.find(".markrow button.mark").trigger("click");
await w.find(".markrow input").trigger("keydown", { key: "Enter" });
expect(ctx.marks.marks.value[0]).toMatchObject({ kind: "event", ref: "us1", frame: "world" });
```

(for the volcano panel `{ kind: "volcano", ref: "211060" }` with whichever volcano the test selects; `frame` follows the context's region, `global` → `"world"`).

- [ ] **Step 5: Provide the store and the nav from App.vue**

In `App.vue` script: import `createMarks`, `MARK_TERMS`, `MARKS`, `MARKS_NAV`, `type MarksNav`; `import { stringifyQuery, type LocationQuery } from "vue-router"`.

```ts
const marks = inject(MARKS, null) ?? createMarks();
provide(MARKS, marks);
const OVERLAY_KEYS = ["marks", "show"];
const withoutOverlay = (q: LocationQuery): LocationQuery =>
  Object.fromEntries(Object.entries(q).filter(([k]) => !OVERLAY_KEYS.includes(k)));
const viewUrl = computed(() => {
  const qs = stringifyQuery(withoutOverlay(route.query));
  return qs === "" ? route.path : `${route.path}?${qs}`;
});
const overlay = computed(() => {
  const g = route.query.marks;
  if (typeof g !== "string" || g === "") return null;
  return { group: g, panels: route.query.show === "panels" };
});
const nav: MarksNav = {
  viewUrl,
  overlay,
  open: (group = ALL_GROUP) =>
    void router.push({ query: { ...withoutOverlay(route.query), marks: group } }),
  list: (group) => void router.push({ query: { ...withoutOverlay(route.query), marks: group } }),
  show: (group) =>
    void router.push({ query: { ...withoutOverlay(route.query), marks: group, show: "panels" } }),
  close: () => void router.replace({ query: withoutOverlay(route.query) }),
  goTo: (url) => void router.push(url),
};
provide(MARKS_NAV, nav);
```

(`open` and `list` are the same action; keep both names because the overlay reads as `nav.list(group)` and the header as `nav.open()`.) Header, before the Times button:

```vue
<button type="button" class="theme-btn fixed marks-btn" aria-haspopup="dialog" @click="nav.open()">
          {{ MARK_TERMS.noun }}{{ marks.marks.value.length > 0 ? ` · ${String(marks.marks.value.length)}` : "" }}
        </button>
```

`App.test.ts`: `mountApp` provides `MARKS` with `createMarks(null)`; add a test:

```ts
it("saves the view without overlay keys and opens the marks overlay from the header", async () => {
  stubCanvas();
  const { wrapper, router } = await mountApp("/wc?event=us1&marks=all");
  expect(wrapper.find(".marks-btn").text()).toBe("Marks");
  await wrapper.find(".detail .markrow button.mark").trigger("click");
  await wrapper.find(".detail .markrow input").trigger("keydown", { key: "Enter" });
  expect(wrapper.find(".marks-btn").text()).toBe("Marks · 1");
  await router.replace("/wc?event=us1");
  await flushPromises();
  await wrapper.find(".marks-btn").trigger("click");
  await flushPromises();
  expect(router.currentRoute.value.query.marks).toBe("all");
});
```

The saved url assertion: read the store through the wrapper's provided instance; simplest is to create `const marks = createMarks(null)` in `mountApp`, provide it, and return it, then `expect(marks.marks.value[0]?.url).toBe("/wc?event=us1")`. The overlay component does not exist yet in this task, so `?marks=all` renders nothing extra; Task 4 extends this test.

- [ ] **Step 6: Gate and commit**

Full gate. Coverage: `App.vue` nav functions `show`, `list`, `close`, `goTo` are exercised in Task 4; if coverage fails on them now, add a temporary test in `App.test.ts` that calls them through a mounted child... simpler: do not provide `nav` as plain closures but keep them, and in this task's App test call `wrapper.vm` no. Accept the ordering: run Tasks 3 and 4 gates together if coverage of App.vue blocks the Task 3 commit, and commit Task 3 with the body split, the button and the nav once `App.test.ts` from Task 4 covers it. Prefer getting to 100 % per commit: in this task, also add the three one-line calls to the Task 3 App test through a tiny inline component is overkill, so the acceptable path is: Task 3 commit may run with the App.vue nav functions uncovered **only if** the Task 4 commit follows in the same PR and restores 100 %; CI runs on the PR head.

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): Mark button on both panels, panel bodies split out, marks nav"
```

---

### Task 4: The overlay

**Files:**

- Create: `apps/web/src/components/ConfirmButton.vue`, `apps/web/src/components/MarkRow.vue`, `apps/web/src/components/MarkPanels.vue`, `apps/web/src/components/MarksOverlay.vue`
- Modify: `apps/web/src/components/App.vue` (render the overlay), `apps/web/src/styles.css`
- Test: `apps/web/test/components/ConfirmButton.test.ts`, `apps/web/test/components/MarksOverlay.test.ts`, `App.test.ts` additions

**Interfaces:**

- Consumes: Tasks 1 to 3.
- Produces: `ConfirmButton` props `{ label: string }` emits `confirm`; `MarkRow` props `{ mark: Mark }`; `MarkPanels` props `{ view: MarkView }`; `MarksOverlay` no props.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/components/ConfirmButton.test.ts
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ConfirmButton from "../../src/components/ConfirmButton.vue";

describe("ConfirmButton", () => {
  afterEach(() => vi.useRealTimers());
  it("asks before confirming and reverts on no, Escape or a timeout", async () => {
    vi.useFakeTimers();
    const w = mount(ConfirmButton, { props: { label: "Delete" } });
    expect(w.find("button").text()).toBe("Delete");
    await w.find("button").trigger("click");
    expect(w.text()).toContain("Delete?");
    await w.find("button.no").trigger("click");
    expect(w.find("button").text()).toBe("Delete");
    await w.find("button").trigger("click");
    await w.find("button.yes").trigger("keydown", { key: "Escape" });
    expect(w.find("button.yes").exists()).toBe(false);
    await w.find("button").trigger("click");
    vi.advanceTimersByTime(5100);
    await nextTick();
    expect(w.find("button.yes").exists()).toBe(false);
    await w.find("button").trigger("click");
    await w.find("button.yes").trigger("click");
    expect(w.emitted("confirm")).toHaveLength(1);
    expect(w.find("button").text()).toBe("Delete");
    w.unmount();
  });
});
```

```ts
// apps/web/test/components/MarksOverlay.test.ts
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MarksOverlay from "../../src/components/MarksOverlay.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import type { MarkDraft } from "../../src/lib/marks.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith, type Context } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/wc?event=us1",
  frame: "world",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};
const etna: MarkDraft = {
  ...quake,
  kind: "volcano",
  ref: "211060",
  name: "Etna watch",
  url: "/volcanoes?volcano=211060",
  headline: "Etna",
  sub: "Italy · Mediterranean",
  stamp: null,
};

async function open(ctx: Context, group = "all", panels = false) {
  ctx.nav.overlay.value = { group, panels };
  const w = mountWith(MarksOverlay, ctx);
  await flushPromises();
  return w;
}

describe("MarksOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetBasemapCache();
    document.body.classList.remove("marks-open");
  });

  it("lists marks newest first with rail counts, renames, deletes and opens a view", async () => {
    stubWorld();
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const b = ctx.marks.add(etna);
    const w = await open(ctx);
    expect(document.body.classList.contains("marks-open")).toBe(true);
    expect(w.find("h2").text()).toBe("Marked events");
    expect(w.find(".marks-rail [aria-current=true]").text()).toBe("All · 2");
    const rows = w.findAll(".markrow-item");
    expect(rows.map((r) => r.find(".mname").text())).toEqual(["Etna watch", "Kuril shock"]);
    expect(rows[1]?.text()).toContain("2026-10-13");
    expect(rows[0]?.text()).toContain("no groups yet");
    await rows[0]?.find(".mname").trigger("click");
    await rows[0]?.find("input").setValue("Etna, renamed");
    await rows[0]?.find("input").trigger("keydown", { key: "Enter" });
    expect(ctx.marks.marks.value[0]?.name).toBe("Etna, renamed");
    await rows[0]?.find(".mname").trigger("click");
    await rows[0]?.find("input").trigger("keydown", { key: "Escape" });
    expect(rows[0]?.find("input").exists()).toBe(false);
    await rows[0]?.find(".mname").trigger("click");
    await rows[0]?.find("input").setValue("Blurred");
    await rows[0]?.find("input").trigger("blur");
    expect(ctx.marks.marks.value[0]?.name).toBe("Blurred");
    await rows[0]?.find(".openview").trigger("click");
    expect(ctx.nav.goTo).toHaveBeenCalledWith("/volcanoes?volcano=211060");
    await rows[0]?.find(".confirm > button").trigger("click");
    await rows[0]?.find("button.yes").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).not.toContain(b.id);
    w.unmount();
    expect(document.body.classList.contains("marks-open")).toBe(false);
  });

  it("creates, renames and deletes groups and toggles membership", async () => {
    stubWorld();
    const ctx = await makeContext();
    const a = ctx.marks.add(quake);
    const w = await open(ctx);
    await w.find(".newgroup").trigger("click");
    await w.find(".newgroup-input").setValue("Cascadia");
    await w.find(".newgroup-input").trigger("keydown", { key: "Enter" });
    const g = ctx.marks.groups.value[0];
    expect(g?.name).toBe("Cascadia");
    expect(ctx.nav.list).toHaveBeenCalledWith(g?.id);
    await w.find(".newgroup").trigger("click");
    await w.find(".newgroup-input").trigger("keydown", { key: "Escape" });
    expect(w.find(".newgroup-input").exists()).toBe(false);
    await w.find(".chip").trigger("click");
    expect(ctx.marks.groupsOf(a.id).map((x) => x.id)).toEqual([g?.id]);
    expect(w.find(".chip").attributes("aria-pressed")).toBe("true");
    await w.find(".chip").trigger("click");
    expect(ctx.marks.groupsOf(a.id)).toEqual([]);
    ctx.nav.overlay.value = { group: g?.id ?? "", panels: false };
    await nextTick();
    expect(w.find(".marks-main").text()).toContain("No marks in this group yet");
    expect(w.find(".showevents").attributes("disabled")).toBeDefined();
    await w.find(".gname").trigger("click");
    await w.find(".gname-input").setValue("Juan de Fuca");
    await w.find(".gname-input").trigger("keydown", { key: "Enter" });
    expect(ctx.marks.groups.value[0]?.name).toBe("Juan de Fuca");
    await w.find(".gname").trigger("click");
    await w.find(".gname-input").trigger("keydown", { key: "Escape" });
    await w.find(".delgroup > button").trigger("click");
    await w.find(".delgroup button.yes").trigger("click");
    expect(ctx.marks.groups.value).toEqual([]);
    expect(ctx.nav.list).toHaveBeenLastCalledWith("all");
    w.unmount();
  });

  it("falls back to All for an unknown group, closes on Escape and the scrim, and shows empty copy", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = await open(ctx, "nope");
    expect(ctx.nav.list).toHaveBeenCalledWith("all");
    ctx.nav.overlay.value = { group: "all", panels: false };
    await nextTick();
    expect(w.find(".marks-main").text()).toContain("Nothing marked yet");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(1);
    const input = document.createElement("input");
    input.dataset.keep = "";
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(1);
    input.remove();
    await w.find(".marks-scrim").trigger("click");
    expect(ctx.nav.close).toHaveBeenCalledTimes(2);
    await w.find(".marks-close").trigger("click");
    expect(ctx.nav.close).toHaveBeenCalledTimes(3);
    w.unmount();
  });

  it("shows a group's panels, loading volcanoes once, and goes back to the list", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    ctx.marks.add(quake);
    ctx.marks.add(etna);
    const load = vi.spyOn(ctx.volcanoes, "load");
    const w = await open(ctx, "all", true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(w.findAll("article.markcard")).toHaveLength(2);
    expect(w.findAll(".panelbody")).toHaveLength(2);
    expect(w.text()).toContain("Origin time");
    expect(w.text()).toContain("Eruptions");
    await w.find(".backtolist").trigger("click");
    expect(ctx.nav.list).toHaveBeenCalledWith("all");
    await w.find("article.markcard .openview").trigger("click");
    expect(ctx.nav.goTo).toHaveBeenCalled();
    ctx.nav.overlay.value = { group: "all", panels: false };
    await nextTick();
    ctx.nav.overlay.value = { group: "all", panels: true };
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("shows the Show events button for a non-empty group and calls show", async () => {
    stubWorld();
    const ctx = await makeContext({ volcanoes: true });
    ctx.marks.add(etna);
    const w = await open(ctx, "all", true);
    expect(vi.mocked(ctx.api.volcanoStatus).mock.calls.length).toBe(1);
    ctx.nav.overlay.value = { group: "all", panels: false };
    await nextTick();
    await w.find(".showevents").trigger("click");
    expect(ctx.nav.show).toHaveBeenCalledWith("all");
    w.unmount();
  });
});
```

(The last test covers the "store already loaded, do not load again" branch: `makeContext({ volcanoes: true })` loaded once, and opening panels must not call `volcanoStatus` again.)

`App.test.ts` addition (extends Task 3's test): after `router.replace("/wc?event=us1&marks=all")`, `expect(wrapper.find(".marks[role=dialog]").exists()).toBe(true)`; click `.marks-close`; `await flushPromises()`; `expect(router.currentRoute.value.query.marks).toBeUndefined()`; then `await router.replace("/wc?marks=all&show=panels")`, assert `article.markcard` count equals the marks added; click `.backtolist` and assert `query.show` undefined; click `.openview` and assert `router.currentRoute.value.fullPath` is the saved url.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/components/ConfirmButton.test.ts test/components/MarksOverlay.test.ts` → FAIL, modules missing.

- [ ] **Step 3: Write ConfirmButton**

```vue
<!-- apps/web/src/components/ConfirmButton.vue -->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";

/** A destructive action that asks inline (`Delete? yes · no`) instead of with a dialog. */
defineProps<{ label: string }>();
const emit = defineEmits<{ confirm: [] }>();
const REVERT_MS = 5000;
const asking = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
function clear(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
function ask(): void {
  asking.value = true;
  clear();
  timer = setTimeout(revert, REVERT_MS);
}
function revert(): void {
  asking.value = false;
  clear();
}
function yes(): void {
  revert();
  emit("confirm");
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    revert();
  }
}
onUnmounted(clear);
</script>

<template>
  <span class="confirm" :class="{ asking }">
    <button v-if="!asking" type="button" @click="ask">{{ label }}</button>
    <template v-else>
      <span>{{ label }}?</span>
      <button type="button" class="yes" data-keep @click="yes" @keydown="onKey">yes</button>
      <button type="button" class="no" data-keep @click="revert" @keydown="onKey">no</button>
    </template>
  </span>
</template>
```

- [ ] **Step 4: Write MarkRow**

```vue
<!-- apps/web/src/components/MarkRow.vue -->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import MarkThumb from "./MarkThumb.vue";
import { fmtStamp } from "../lib/format.js";
import { MARKS, MARKS_NAV, useInjected, ZONE } from "../lib/keys.js";
import { NAME_MAX, type Mark } from "../lib/marks.js";

/** One marked view in the overlay list: thumbnail, editable name, facts, group chips, open and delete. */
const props = defineProps<{ mark: Mark }>();
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);
const zone = useInjected(ZONE);

const editing = ref(false);
const draft = ref("");
const input = ref<HTMLInputElement | null>(null);
const members = computed(() => new Set(store.groupsOf(props.mark.id).map((g) => g.id)));
const marked = computed(() => props.mark.createdAt.slice(0, 10));

async function edit(): Promise<void> {
  draft.value = props.mark.name;
  editing.value = true;
  await nextTick();
  input.value?.select();
}
function commit(): void {
  if (!editing.value) return;
  store.rename(props.mark.id, draft.value);
  editing.value = false;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter") commit();
  else if (e.key === "Escape") {
    e.stopPropagation();
    editing.value = false;
  }
}
</script>

<template>
  <div class="markrow-item">
    <MarkThumb :lon="mark.lon" :lat="mark.lat" :frame="mark.frame" :kind="mark.kind" />
    <div class="mbody">
      <input
        v-if="editing"
        ref="input"
        v-model="draft"
        type="text"
        class="mname-input"
        data-keep
        :maxlength="NAME_MAX"
        aria-label="Mark name"
        @keydown="onKey"
        @blur="commit"
      />
      <button v-else type="button" class="mname" title="Rename" @click="edit">
        {{ mark.name }}
      </button>
      <div class="mfacts">
        {{ mark.headline }} · {{ mark.sub
        }}<template v-if="mark.stamp !== null"> · {{ fmtStamp(mark.stamp, zone) }}</template>
      </div>
      <div class="mmeta">marked {{ marked }}</div>
      <div class="mgroups">
        <span v-if="store.groups.value.length === 0" class="muted">no groups yet</span>
        <button
          v-for="g in store.groups.value"
          :key="g.id"
          type="button"
          class="chip"
          :aria-pressed="members.has(g.id)"
          @click="store.setMember(mark.id, g.id, !members.has(g.id))"
        >
          {{ g.name }}
        </button>
      </div>
    </div>
    <div class="mactions">
      <button type="button" class="openview" @click="nav.goTo(mark.url)">Open view</button>
      <ConfirmButton label="Delete" @confirm="store.remove(mark.id)" />
    </div>
  </div>
</template>
```

`commit` is reached from `blur` after Enter already closed the editor, hence the `if (!editing.value) return;` guard (covered by the Enter path: Enter commits, then the input unmounts and fires blur).

- [ ] **Step 5: Write MarkPanels**

```vue
<!-- apps/web/src/components/MarkPanels.vue -->
<script setup lang="ts">
import { watch } from "vue";
import EventDetailBody from "./EventDetailBody.vue";
import MarkThumb from "./MarkThumb.vue";
import VolcanoDetailBody from "./VolcanoDetailBody.vue";
import { MARKS_NAV, useInjected, VOLCANOES } from "../lib/keys.js";
import type { MarkView } from "../lib/marks.js";

/** A group's marks laid out as full panels. */
const props = defineProps<{ view: MarkView }>();
const nav = useInjected(MARKS_NAV);
const volcanoes = useInjected(VOLCANOES);

watch(
  () => props.view.marks.some((m) => m.kind === "volcano"),
  (needs) => {
    if (needs && volcanoes.volcanoes.value.length === 0) void volcanoes.load();
  },
  { immediate: true },
);
</script>

<template>
  <div class="markpanels">
    <button type="button" class="backtolist" @click="nav.list(view.id)">← Back to list</button>
    <div class="markcards">
      <article v-for="m in view.marks" :key="m.id" class="markcard">
        <header>
          <MarkThumb :lon="m.lon" :lat="m.lat" :frame="m.frame" :kind="m.kind" />
          <div>
            <div class="mname">{{ m.name }}</div>
            <div class="mfacts">{{ m.headline }} · {{ m.sub }}</div>
          </div>
          <button type="button" class="openview" @click="nav.goTo(m.url)">Open view</button>
        </header>
        <EventDetailBody v-if="m.kind === 'event'" :id="m.ref" />
        <VolcanoDetailBody v-else :number="Number(m.ref)" />
      </article>
    </div>
  </div>
</template>
```

The "mark changes while volcanoes already loaded" branch is covered by the last overlay test.

- [ ] **Step 6: Write MarksOverlay**

```vue
<!-- apps/web/src/components/MarksOverlay.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import MarkPanels from "./MarkPanels.vue";
import MarkRow from "./MarkRow.vue";
import { MARKS, MARKS_NAV, useInjected } from "../lib/keys.js";
import { ALL_GROUP, MARK_TERMS, NAME_MAX } from "../lib/marks.js";

/** The full-screen manager for marked views: groups in a rail, marks as rows or as stacked panels. */
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);

const state = computed(() => nav.overlay.value ?? { group: ALL_GROUP, panels: false });
const view = computed(() => store.view(state.value.group));
watch(
  view,
  (v) => {
    if (v === null) nav.list(ALL_GROUP);
  },
  { immediate: true },
);

const closeBtn = ref<HTMLButtonElement | null>(null);
const adding = ref(false);
const newName = ref("");
const newInput = ref<HTMLInputElement | null>(null);
const renaming = ref(false);
const groupName = ref("");
const groupInput = ref<HTMLInputElement | null>(null);

async function beginAdd(): Promise<void> {
  newName.value = "";
  adding.value = true;
  await nextTick();
  newInput.value?.focus();
}
function onAddKey(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    const g = store.addGroup(newName.value);
    adding.value = false;
    nav.list(g.id);
  } else if (e.key === "Escape") {
    e.stopPropagation();
    adding.value = false;
  }
}
async function beginRename(): Promise<void> {
  if (view.value === null || view.value.virtual) return;
  groupName.value = view.value.name;
  renaming.value = true;
  await nextTick();
  groupInput.value?.select();
}
function onRenameKey(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    if (view.value !== null) store.renameGroup(view.value.id, groupName.value);
    renaming.value = false;
  } else if (e.key === "Escape") {
    e.stopPropagation();
    renaming.value = false;
  }
}
function removeGroup(): void {
  if (view.value === null) return;
  store.removeGroup(view.value.id);
  nav.list(ALL_GROUP);
}
function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  if (e.target instanceof HTMLElement && e.target.dataset.keep !== undefined) return;
  nav.close();
}
onMounted(() => {
  document.body.classList.add("marks-open");
  document.addEventListener("keydown", onKey);
  closeBtn.value?.focus();
});
onUnmounted(() => {
  document.body.classList.remove("marks-open");
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="marks-scrim" @click="nav.close()"></div>
  <section class="marks" role="dialog" aria-modal="true" aria-labelledby="marks-title">
    <div class="marks-head">
      <h2 id="marks-title">{{ MARK_TERMS.title }}</h2>
      <button
        ref="closeBtn"
        type="button"
        class="marks-close"
        aria-label="Close marked events"
        @click="nav.close()"
      >
        ×
      </button>
    </div>
    <nav class="marks-rail" :aria-label="MARK_TERMS.groups">
      <button
        type="button"
        :aria-current="state.group === ALL_GROUP ? 'true' : undefined"
        @click="nav.list(ALL_GROUP)"
      >
        {{ MARK_TERMS.all }} · {{ store.marks.value.length }}
      </button>
      <button
        v-for="g in store.groups.value"
        :key="g.id"
        type="button"
        :aria-current="state.group === g.id ? 'true' : undefined"
        @click="nav.list(g.id)"
      >
        {{ g.name }} · {{ g.marks.length }}
      </button>
      <input
        v-if="adding"
        ref="newInput"
        v-model="newName"
        type="text"
        class="newgroup-input"
        data-keep
        :maxlength="NAME_MAX"
        :placeholder="`${MARK_TERMS.group} name`"
        @keydown="onAddKey"
      />
      <button v-else type="button" class="newgroup" @click="beginAdd">
        + New {{ MARK_TERMS.group.toLowerCase() }}
      </button>
    </nav>
    <div v-if="view !== null" class="marks-main">
      <template v-if="state.panels">
        <MarkPanels :view="view" />
      </template>
      <template v-else>
        <div class="marks-grouphead">
          <input
            v-if="renaming"
            ref="groupInput"
            v-model="groupName"
            type="text"
            class="gname-input"
            data-keep
            :maxlength="NAME_MAX"
            aria-label="Group name"
            @keydown="onRenameKey"
          />
          <button
            v-else
            type="button"
            class="gname"
            :disabled="view.virtual"
            :title="view.virtual ? undefined : 'Rename'"
            @click="beginRename"
          >
            {{ view.name }}
          </button>
          <span class="sp"></span>
          <button
            type="button"
            class="showevents"
            :disabled="view.marks.length === 0"
            @click="nav.show(view.id)"
          >
            Show events
          </button>
          <ConfirmButton
            v-if="!view.virtual"
            class="delgroup"
            label="Delete group"
            @confirm="removeGroup"
          />
        </div>
        <p v-if="view.marks.length === 0 && view.virtual" class="note">
          Nothing marked yet. Open an event or a volcano and use ☆ {{ MARK_TERMS.verb }} under its
          name.
        </p>
        <p v-else-if="view.marks.length === 0" class="note">
          No marks in this group yet. Add some from the chips on each mark in {{ MARK_TERMS.all }}.
        </p>
        <MarkRow v-for="m in view.marks" :key="m.id" :mark="m" />
      </template>
    </div>
  </section>
</template>
```

Coverage notes: `beginRename` early return for a virtual view is unreachable through the UI (the button is disabled) and `removeGroup`'s null guard likewise; drop those guards and instead narrow with `v-if` in the template (`view !== null` is already guaranteed inside the block; for TS inside the handlers use a local `const v = view.value; if (v === null || v.virtual) return;` only where TS needs it, and cover with a direct test if it stays). `ConfirmButton` with a `class` attribute: the root is a single `span`, so the attribute falls through.

In `App.vue` template, after `<VolcanoDetail …/>`: `<MarksOverlay v-if="nav.overlay.value !== null" />`.

- [ ] **Step 7: Styles**

Append to `styles.css`:

```css
body.marks-open {
  overflow: hidden;
}
.marks-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 30;
}
.marks {
  position: fixed;
  inset: 24px;
  z-index: 31;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}
.marks-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.marks-head h2 {
  margin: 0;
  font: 600 18px var(--f-ui);
}
.marks-close {
  font: 600 20px var(--f-ui);
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  width: 34px;
  height: 34px;
  border-radius: 6px;
  cursor: pointer;
}
.marks-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-right: 1px solid var(--line);
  overflow: auto;
}
.marks-rail button,
.marks-rail input {
  text-align: left;
  font: 14px var(--f-ui);
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--ink);
  cursor: pointer;
}
.marks-rail button[aria-current="true"] {
  background: var(--bg);
  border-color: var(--line);
}
.marks-rail input {
  border-color: var(--line);
  background: var(--bg);
}
.marks-main {
  overflow: auto;
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.marks-grouphead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.marks-grouphead .gname {
  font: 600 16px var(--f-ui);
  background: none;
  border: 0;
  color: var(--ink);
  padding: 0;
  cursor: pointer;
}
.marks-grouphead .gname:disabled {
  cursor: default;
}
.marks-grouphead .gname-input,
.marks-main .mname-input {
  font: 600 15px var(--f-ui);
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
  color: var(--ink);
}
.marks-grouphead .showevents,
.marks .openview,
.marks .confirm button,
.marks .backtolist {
  font: 13px var(--f-ui);
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
}
.marks button:disabled {
  opacity: 0.5;
  cursor: default;
}
.markrow-item {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.markrow-item .mname,
.markcard .mname {
  font: 600 15px var(--f-ui);
  background: none;
  border: 0;
  padding: 0;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.mfacts {
  font: 13px var(--f-data);
  color: var(--ink);
}
.mmeta,
.muted {
  font: 12px var(--f-ui);
  color: var(--muted);
}
.mgroups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.chip {
  font: 12px var(--f-ui);
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.chip[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
.mactions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.confirm.asking {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font: 13px var(--f-ui);
}
.markpanels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.markcards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.markcard {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.markcard header {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.markcard .panelbody {
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
@media (min-width: 1100px) {
  .markcards {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 720px) {
  .marks {
    inset: 0;
    border-radius: 0;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
  }
  .marks-rail {
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .markrow-item,
  .markcard header {
    grid-template-columns: 96px 1fr;
  }
  .mactions {
    grid-column: 1 / -1;
    flex-direction: row;
  }
}
```

The side panel's `.bd` already provides the gap for `.panelbody` inside the drawer; make `.panelbody { display: contents }` inside `.detail .bd` so the drawer's layout is unchanged: add `.detail .bd > .panelbody { display: contents; }`.

- [ ] **Step 8: Gate, Chrome check, commit**

Full gate to 100 %. Then with `pnpm dev` running, in Chrome: open `/wc?event=<an id from the table>`, mark it; open a volcano on `/volcanoes`, mark it; open `Marks · 2`; create a group, add both, rename one, Show events, Back to list, Open view; check the thumbnails show the West Coast outline for the first and the world for the second; narrow the window to 600 px and check the chips rail.

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): Marked events overlay with groups, inline editing and stacked panels"
```

---

### Task 5: Docs and PR

**Files:**

- Modify: `README.md` (Front end bullets), `CLAUDE.md` (Front end section), memory roadmap.

- [ ] **Step 1: README**

After the Active Earth bullet add:

```md
- **Marked events.** `☆ Mark` under the name in either detail panel saves the view (page, region,
  window, filters and selection) under a name of your choosing, in the browser only
  (`localStorage`, `tectonic.marks`); nothing is sent anywhere. `Marks · N` in the header opens
  an overlay over the current view where marks can be renamed, deleted, gathered into groups
  (`All` always holds every mark) and reopened with `Open view`. Each mark carries a small
  schematic of the world or the West Coast with a star at the event.
- **Show events** on a group lays its marks out as full panels, the same sections as the side
  panels, two across on a wide screen, so a set of events can be read together. The URL carries
  the overlay (`?marks=<group>`, `&show=panels`), so Escape, the close control and the back
  button all return to the untouched view.
```

- [ ] **Step 2: CLAUDE.md**

After the Active Earth bullet in Front end add:

```md
- Marks: `src/lib/marks.ts` (`createMarks`, `MarksStore`, `MARK_TERMS`, `ALL_GROUP`; `localStorage` `tectonic.marks`, `createMarks(null)` in tests) under the `MARKS` key; `MARKS_NAV` (`MarksNav` in `keys.ts`, built in `App.vue`) is the only router access: `viewUrl` is the route minus `marks`/`show`, `overlay` reads them, `open/list/show/close/goTo` write them. `MarkButton.vue` sits under both panel headers; the panel bodies are `EventDetailBody.vue` and `VolcanoDetailBody.vue` so `MarksOverlay.vue` (`MarkRow`, `MarkPanels`, `ConfirmButton`) can stack them. Thumbnails: `MarkThumb.vue` over `src/lib/thumb.ts` and `src/lib/basemap-cache.ts` (`loadBasemapFor`, shared with `mapview.ts`; `resetMapCaches` clears it).
```

- [ ] **Step 3: Gate, push, PR**

Prettier check on README, CLAUDE.md and docs; commit `docs: marked events`; push `marked-events`; open the PR with `gh.py pr marked-events main <title-file>` with a body summarising the five commits, verification and the follow-ups (open event here, export/import, reorder, Pin and Probe). Update the roadmap memory.

## Self-review

- Spec coverage: §1 Task 1; §2 Task 3 (nav, header) and Task 4 (render); §3 Task 3; §4 Task 3; §5 Task 4; §6 Task 2; §7 Tasks 2 to 4; §8 across tasks; §9 Task 5.
- Names used consistently: `loadBasemapFor`, `resetBasemapCache`, `thumbProjection`, `outlinePath`, `starPath`, `THUMB`, `MarkSubject`, `defaultName`, `MARK_TERMS`, `ALL_GROUP`, `NAME_MAX`, nav `open/list/show/close/goTo`, context `ctx.marks`, `ctx.nav`.
- Known soft spot: Task 3's commit may leave the App.vue nav closures uncovered until Task 4; CI runs on the PR head, which is at 100 %.
