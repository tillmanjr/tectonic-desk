# Marks tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Marked events overlay three tools: open a mark's subject in the current view, reorder groups, and export or import the whole marks document.

**Architecture:** All work is in `apps/web`. Pure logic goes in `src/lib` (`marks-nav.ts` for the "open here" URL, `notice.ts` for a one-line app notice, `marks.ts` for group order and document merge) with unit tests; components (`MarkRow`, `MarkPanels`, `MarksOverlay`, a new `MarksIO`) only call the store and the injected `MarksNav`. `App.vue` is the only file touching the router and gains `openHere` on the nav plus the notice strip.

**Tech Stack:** Vue 3, vue-router, Vitest 5 with happy-dom, @vue/test-utils. Spec: `docs/superpowers/specs/2026-10-24-marks-tools-design.md`.

## Global Constraints

- TypeScript strict, ESM, NodeNext; local imports end in `.js`.
- No `as` casts to silence nullability, no `!` assertions; restructure instead.
- Coverage thresholds are 100% (lines, branches, functions, statements) on `apps/web/src`.
- Components never touch the router; they call the injected `MarksNav`.
- No browser dialogs; destructive actions use `ConfirmButton` (inline `label? yes · no`).
- Commit message footer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run tests from the repo root with `pnpm --filter @tectonic/web exec vitest run <file>`; the full gate is `pnpm test:coverage`, `pnpm lint`, `pnpm typecheck` at the root.
- Working branch: `marks-tools` (already created, spec committed).

---

### Task 1: `hereTarget` (pure URL arithmetic)

**Files:**

- Create: `apps/web/src/lib/marks-nav.ts`
- Test: `apps/web/test/lib/marks-nav.test.ts`

**Interfaces:**

- Consumes: `Page`, `pagePath` from `src/router.ts`; `Mark`, `MarkKind` from `src/lib/marks.ts`.
- Produces: `showsKind(page, kind): boolean`, `hereTarget(page, region, query, mark): HereTarget` with `HereTarget = { url: string; switched: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/lib/marks-nav.test.ts
import { describe, expect, it } from "vitest";
import { hereTarget, showsKind } from "../../src/lib/marks-nav.js";
import type { Mark } from "../../src/lib/marks.js";

const quake: Mark = {
  id: "a",
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/earthquakes/wc?event=us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
  mag: 5.5,
  depthKm: 10,
  createdAt: "2026-10-21T00:00:00.000Z",
};
const etna: Mark = { ...quake, id: "b", kind: "volcano", ref: "211060", stamp: null };

describe("marks-nav", () => {
  it("knows which pages can show each kind", () => {
    expect(showsKind("earthquakes", "event")).toBe(true);
    expect(showsKind("earthquakes", "volcano")).toBe(false);
    expect(showsKind("volcanoes", "event")).toBe(false);
    expect(showsKind("volcanoes", "volcano")).toBe(true);
    expect(showsKind("active", "event")).toBe(true);
    expect(showsKind("active", "volcano")).toBe(true);
  });

  it("selects the mark in the current view, dropping the other selection", () => {
    expect(hereTarget("earthquakes", "wc", { from: "2026-01-01", volcano: "1" }, quake)).toEqual({
      url: "/earthquakes/wc?from=2026-01-01&event=us1",
      switched: false,
    });
    expect(hereTarget("volcanoes", "global", { event: "us9", tz: "local" }, etna)).toEqual({
      url: "/volcanoes?tz=local&volcano=211060",
      switched: false,
    });
    expect(hereTarget("active", "global", {}, quake)).toEqual({
      url: "/active?event=us1",
      switched: false,
    });
  });

  it("switches to Active Earth with the same region when the page cannot show the kind", () => {
    expect(hereTarget("volcanoes", "wc", { from: "2026-01-01" }, quake)).toEqual({
      url: "/active/wc?from=2026-01-01&event=us1",
      switched: true,
    });
    expect(hereTarget("earthquakes", "global", {}, etna)).toEqual({
      url: "/active?volcano=211060",
      switched: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks-nav.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/marks-nav.js`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/marks-nav.ts
import { pagePath, type Page } from "../router.js";
import type { Mark, MarkKind } from "./marks.js";

/** Pages whose panels can show a mark's kind. */
export const showsKind = (page: Page, kind: MarkKind): boolean =>
  kind === "event" ? page !== "volcanoes" : page !== "earthquakes";

export interface HereTarget {
  /** Path and query to push. */
  url: string;
  /** True when the page had to change to Active Earth. */
  switched: boolean;
}

/**
 * The current view with the mark's subject selected: the other selection key dropped, `event` or
 * `volcano` set to the mark's ref, region and every other key kept. When the page cannot show the
 * kind the path becomes Active Earth for the same region.
 */
export function hereTarget(
  page: Page,
  region: string,
  query: Record<string, string>,
  mark: Mark,
): HereTarget {
  const switched = !showsKind(page, mark.kind);
  const q = new URLSearchParams(query);
  q.delete("event");
  q.delete("volcano");
  q.set(mark.kind === "event" ? "event" : "volcano", mark.ref);
  const path = pagePath(switched ? "active" : page, region);
  return { url: `${path}?${q.toString()}`, switched };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks-nav.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marks-nav.ts apps/web/test/lib/marks-nav.test.ts
git commit -m "feat(web): hereTarget selects a mark in the current view, switching to Active Earth when needed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Notice store and strip

**Files:**

- Create: `apps/web/src/lib/notice.ts`
- Test: `apps/web/test/lib/notice.test.ts`
- Modify: `apps/web/src/lib/keys.ts` (add `NOTICE`)
- Modify: `apps/web/src/components/App.vue` (create, provide, render)
- Modify: `apps/web/src/styles.css` (append `.notice`)
- Modify: `apps/web/test/support/mount.ts` (context gains `notice`)
- Modify: `apps/web/test/components/App.test.ts` (one assertion in a new test, see Task 3; here only make sure the strip is absent at boot)

**Interfaces:**

- Produces: `NoticeStore { current: Readonly<Ref<string | null>>; post(text, ms?): void; clear(): void }`, `createNotice(timers?)`, `NOTICE_MS = 2500`, `NOTICE: InjectionKey<NoticeStore>`.

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/web/test/lib/notice.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotice, NOTICE_MS } from "../../src/lib/notice.js";

describe("notice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a text for a while, restarting the timer on a new post", () => {
    vi.useFakeTimers();
    const n = createNotice();
    expect(n.current.value).toBeNull();
    n.post("Switching to Active Earth");
    expect(n.current.value).toBe("Switching to Active Earth");
    vi.advanceTimersByTime(NOTICE_MS - 1);
    n.post("Second");
    vi.advanceTimersByTime(NOTICE_MS - 1);
    expect(n.current.value).toBe("Second");
    vi.advanceTimersByTime(1);
    expect(n.current.value).toBeNull();
  });

  it("takes a custom duration and clears on demand", () => {
    vi.useFakeTimers();
    const n = createNotice();
    n.post("Short", 100);
    vi.advanceTimersByTime(99);
    expect(n.current.value).toBe("Short");
    vi.advanceTimersByTime(1);
    expect(n.current.value).toBeNull();
    n.post("Gone");
    n.clear();
    expect(n.current.value).toBeNull();
    n.clear();
    vi.advanceTimersByTime(NOTICE_MS);
    expect(n.current.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/notice.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/notice.js`.

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/notice.ts
import { ref, type Ref } from "vue";

export interface NoticeStore {
  /** The text on show, or null. */
  current: Readonly<Ref<string | null>>;
  /** Shows `text` for `ms` milliseconds; a new post replaces the text and restarts the timer. */
  post(text: string, ms?: number): void;
  /** Hides the text at once. */
  clear(): void;
}

export const NOTICE_MS = 2500;

/** One short app-level message at a time, for feedback that has no natural place in the layout. */
export function createNotice(): NoticeStore {
  const current = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  function clear(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    current.value = null;
  }
  return {
    current,
    post(text, ms = NOTICE_MS) {
      clear();
      current.value = text;
      timer = setTimeout(clear, ms);
    },
    clear,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/notice.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add the key**

In `apps/web/src/lib/keys.ts`, add the import after the `MarksStore` import and the key after `SETTINGS`:

```ts
import type { NoticeStore } from "./notice.js";
```

```ts
/** The one-line app notice; `post` from anywhere, rendered once by `App.vue`. */
export const NOTICE: InjectionKey<NoticeStore> = Symbol("notice");
```

- [ ] **Step 6: Create, provide and render it in `App.vue`**

In `apps/web/src/components/App.vue`:

Imports: add `NOTICE` to the `../lib/keys.js` import list and add

```ts
import { createNotice } from "../lib/notice.js";
```

After `const marks = inject(MARKS, null) ?? createMarks();` add

```ts
const notice = createNotice();
```

After `provide(MARKS, marks);` add

```ts
provide(NOTICE, notice);
```

At the end of the template, after `<MarksOverlay v-if="overlay !== null" />`, add

```html
<Transition name="notice">
  <div v-if="notice.current.value !== null" class="notice" role="status">
    {{ notice.current.value }}
  </div>
</Transition>
```

- [ ] **Step 7: Styles**

Append to `apps/web/src/styles.css`, before the `@media (max-width: 720px)` block that holds `.marks` (search for `/* Marked events: Compare` and insert before the `@media` block that precedes it):

```css
/* App notice: one short line above everything, never interactive. */
.notice {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 40;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--ink);
  font: 13px var(--f-ui);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  pointer-events: none;
}
.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.2s ease;
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
```

- [ ] **Step 8: Test context**

In `apps/web/test/support/mount.ts`:

- add `NOTICE,` to the keys import list (alphabetical, after `MARKS_NAV`);
- add `import { createNotice, type NoticeStore } from "../../src/lib/notice.js";` after the marks import;
- add `notice: NoticeStore;` to `Context` after `marks`;
- add `notice: createNotice(),` to the returned object after `marks: createMarks(null),`;
- add `provide(NOTICE, ctx.notice);` after `provide(MARKS_NAV, ctx.nav);` in `mountWith`.

- [ ] **Step 9: Run the web tests, lint and typecheck**

Run: `pnpm --filter @tectonic/web exec vitest run && pnpm lint && pnpm typecheck`
Expected: all green. (`App.vue` renders no notice at boot, so no test changes yet; coverage of `post` through the app comes in Task 3.)

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/notice.ts apps/web/test/lib/notice.test.ts apps/web/src/lib/keys.ts apps/web/src/components/App.vue apps/web/src/styles.css apps/web/test/support/mount.ts
git commit -m "feat(web): a one-line app notice store rendered by the shell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `Open here` on rows and cards

**Files:**

- Modify: `apps/web/src/lib/keys.ts` (`MarksNav.openHere`)
- Modify: `apps/web/src/components/App.vue` (implement `openHere`)
- Modify: `apps/web/src/components/MarkRow.vue`
- Modify: `apps/web/src/components/MarkPanels.vue`
- Modify: `apps/web/test/support/mount.ts` (`openHere: vi.fn()`)
- Test: `apps/web/test/components/MarksOverlay.test.ts`, `apps/web/test/components/App.test.ts`

**Interfaces:**

- Consumes: `hereTarget` from Task 1, `NOTICE`/`createNotice` from Task 2.
- Produces: `MarksNav.openHere(mark: Mark): void`.

- [ ] **Step 1: Write the failing component tests**

In `apps/web/test/components/MarksOverlay.test.ts`, inside the first test (`lists marks newest first ... opens a view`), find the line that clicks `.openview` and asserts `ctx.nav.goTo`; add right after it:

```ts
await w.findAll(".openhere")[0]?.trigger("click");
expect(ctx.nav.openHere).toHaveBeenCalledWith(ctx.marks.marks.value[0]);
```

In the test `shows a group's panels, loading volcanoes once, and goes back to the list`, after the existing `Open view` assertion on a card (search for `.markcard .openview` or the `goTo` assertion in that test), add:

```ts
await w.find(".markcard .openhere").trigger("click");
expect(ctx.nav.openHere).toHaveBeenCalledTimes(1);
```

(If that test has no `Open view` click, add both clicks after the cards are asserted to exist.)

In `apps/web/test/components/App.test.ts`, add a new test at the end of the `describe`:

```ts
it("opens a mark in the current view, switching to Active Earth only when the page lacks the panel", async () => {
  stubCanvas();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { wrapper, router, marks } = await mountApp("/volcanoes/wc?from=2026-01-01&marks=all");
  marks.add({
    kind: "event",
    ref: "us1",
    name: "Kuril shock",
    url: "/earthquakes/wc?event=us1",
    frame: "wc",
    lon: -122,
    lat: 37,
    headline: "M5.5 mww",
    sub: "10 km N of Somewhere",
    stamp: "2026-10-13T10:00:00.000Z",
    mag: 5.5,
    depthKm: 10,
  });
  await flushPromises();
  await wrapper.find(".openhere").trigger("click");
  await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe("/active/wc?from=2026-01-01&event=us1");
  expect(wrapper.find(".notice").text()).toBe("Switching to Active Earth");
  vi.advanceTimersByTime(3000);
  await flushPromises();
  expect(wrapper.find(".notice").exists()).toBe(false);

  await router.push("/earthquakes/wc?volcano=1&marks=all");
  await flushPromises();
  await wrapper.find(".openhere").trigger("click");
  await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe("/earthquakes/wc?event=us1");
  expect(wrapper.find(".notice").exists()).toBe(false);
  wrapper.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksOverlay.test.ts test/components/App.test.ts`
Expected: FAIL: `.openhere` not found / `openHere` is not a function.

- [ ] **Step 3: Extend `MarksNav`**

In `apps/web/src/lib/keys.ts`, add `import type { Mark, MarksStore } from "./marks.js";` (replacing the `MarksStore`-only import) and inside `MarksNav`, after `goTo`:

```ts
  /** Selects a mark's subject in the current view; switches to Active Earth when the page cannot show it. */
  openHere: (mark: Mark) => void;
```

In `apps/web/test/support/mount.ts`, add `openHere: vi.fn(),` after `goTo: vi.fn(),`.

- [ ] **Step 4: Implement it in `App.vue`**

Add the import:

```ts
import { hereTarget } from "../lib/marks-nav.js";
```

After `withoutOverlay`, add:

```ts
/** The query as flat strings: repeated keys keep their first value, which a saved view never has anyway. */
const flatQuery = (q: LocationQuery): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") out[k] = first;
  }
  return out;
};
```

`routeRegion` is declared after `nav` today; move the `routeRegion` computed above `const nav: MarksNav = {` so the nav can read it. Then add to the `nav` object after `goTo`:

```ts
  openHere: (mark) => {
    const t = hereTarget(page.value, routeRegion.value, flatQuery(withoutOverlay(route.query)), mark);
    void router.push(t.url);
    if (t.switched) notice.post("Switching to Active Earth");
  },
```

- [ ] **Step 5: Buttons**

`apps/web/src/components/MarkRow.vue`, inside `.mactions`, before `Open view`:

```html
<button
  type="button"
  class="openhere"
  title="Select it in the view you were in"
  @click="nav.openHere(mark)"
>
  Open here
</button>
```

`apps/web/src/components/MarkPanels.vue`: the card header is a four-column grid whose last track holds the one button, so wrap the buttons in the row's `.mactions` block (already styled to stack, and to sit on its own line under 720 px):

```html
<div class="mactions">
  <button
    type="button"
    class="openhere"
    title="Select it in the view you were in"
    @click="nav.openHere(m)"
  >
    Open here
  </button>
  <button type="button" class="openview" @click="nav.goTo(m.url)">Open view</button>
</div>
```

Styles: in `apps/web/src/styles.css`, the rule `.marks .openview,` (around line 1522, grouped with `.showevents` and `.compare`) gets `.marks .openhere,` added on the line before it so the new button shares the look.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksOverlay.test.ts test/components/App.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): Open here selects a mark in the current view, with a notice when the page switches

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Group order

**Files:**

- Modify: `apps/web/src/lib/marks.ts` (`moveGroup`)
- Modify: `apps/web/src/components/MarksOverlay.vue`
- Test: `apps/web/test/lib/marks.test.ts`, `apps/web/test/components/MarksOverlay.test.ts`

**Interfaces:**

- Produces: `MarksStore.moveGroup(id: string, delta: -1 | 1): void`.

- [ ] **Step 1: Write the failing unit test**

Append inside the `describe("marks")` in `apps/web/test/lib/marks.test.ts`:

```ts
it("moves a stored group up or down, ignoring the ends and unknown ids", () => {
  const m = memory();
  const s = createMarks(m.storage, deps());
  const a = s.addGroup("A");
  const b = s.addGroup("B");
  const c = s.addGroup("C");
  const ids = () => s.groups.value.map((g) => g.id);
  s.moveGroup(c.id, -1);
  expect(ids()).toEqual([a.id, c.id, b.id]);
  s.moveGroup(a.id, -1);
  s.moveGroup(b.id, 1);
  s.moveGroup("nope", 1);
  expect(ids()).toEqual([a.id, c.id, b.id]);
  s.moveGroup(a.id, 1);
  expect(ids()).toEqual([c.id, a.id, b.id]);
  const written = JSON.parse(m.store.get(MARKS_KEY) ?? "") as { groups: { id: string }[] };
  expect(written.groups.map((g) => g.id)).toEqual([c.id, a.id, b.id]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks.test.ts`
Expected: FAIL, `s.moveGroup is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/marks.ts`, add to the `MarksStore` interface after `move`:

```ts
  /** Moves a stored group one place up (-1) or down (1); ends and unknown ids are no-ops. */
  moveGroup(id: string, delta: -1 | 1): void;
```

and to the returned object after `move(...)`:

```ts
    moveGroup(id, delta) {
      const i = groups.value.findIndex((g) => g.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= groups.value.length) return;
      const next = [...groups.value];
      next.splice(j, 0, ...next.splice(i, 1));
      groups.value = next;
      persist();
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Append to `apps/web/test/components/MarksOverlay.test.ts`:

```ts
it("reorders stored groups from the group head; All has no arrows", async () => {
  stubWorld();
  const ctx = await makeContext();
  const a = ctx.marks.addGroup("A");
  const b = ctx.marks.addGroup("B");
  const w = await open(ctx);
  expect(w.find(".marks-grouphead .morder").exists()).toBe(false);
  ctx.overlay.value = { group: a.id, mode: "list" };
  await nextTick();
  expect(w.find(".marks-grouphead .up").attributes("disabled")).toBeDefined();
  expect(w.find(".marks-grouphead .down").attributes("disabled")).toBeUndefined();
  await w.find(".marks-grouphead .down").trigger("click");
  expect(ctx.marks.groups.value.map((g) => g.id)).toEqual([b.id, a.id]);
  expect(w.findAll(".marks-rail button")[1]?.text()).toBe("B · 0");
  expect(w.find(".marks-grouphead .down").attributes("disabled")).toBeDefined();
  await w.find(".marks-grouphead .up").trigger("click");
  expect(ctx.marks.groups.value.map((g) => g.id)).toEqual([a.id, b.id]);
  w.unmount();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksOverlay.test.ts`
Expected: FAIL, `.marks-grouphead .up` not found.

- [ ] **Step 7: Implement in the overlay**

In `apps/web/src/components/MarksOverlay.vue` script, after `const view = computed(...)`:

```ts
/** The viewed group's place in the rail, for the order arrows; -1 for All. */
const groupIndex = computed(() => store.groups.value.findIndex((g) => g.id === state.value.group));
```

In the template, as the first child of `.marks-grouphead` (before the rename input):

```html
<div v-if="!view.virtual" class="morder">
  <button
    type="button"
    class="up"
    :disabled="groupIndex === 0"
    aria-label="Move group up"
    @click="store.moveGroup(view.id, -1)"
  >
    ▲
  </button>
  <button
    type="button"
    class="down"
    :disabled="groupIndex === store.groups.value.length - 1"
    aria-label="Move group down"
    @click="store.moveGroup(view.id, 1)"
  >
    ▼
  </button>
</div>
```

`.morder` is already styled for rows (`.marks .morder button`), so nothing else is needed.

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksOverlay.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/marks.ts apps/web/src/components/MarksOverlay.vue apps/web/test/lib/marks.test.ts apps/web/test/components/MarksOverlay.test.ts
git commit -m "feat(web): groups can be reordered from the overlay's group head

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Document export and merge (pure + store)

**Files:**

- Modify: `apps/web/src/lib/marks.ts`
- Test: `apps/web/test/lib/marks.test.ts`

**Interfaces:**

- Produces: `MarksDocument { marks: Mark[]; groups: MarkGroup[] }`, `MergeReport { marks: number; groups: number; members: number }`, `exportDocument(doc, now): string`, `exportFileName(now): string`, `mergeDocuments(current, incoming): { doc: MarksDocument; report: MergeReport }`, `countsText(doc): string`, `reportText(r): string`, and on `MarksStore`: `document(): MarksDocument`, `merge(doc): MergeReport`, `replaceAll(doc): void`. `parseMarks` now returns `MarksDocument` (same shape as before, named).

- [ ] **Step 1: Write the failing tests**

Add to the import in `apps/web/test/lib/marks.test.ts`: `countsText, exportDocument, exportFileName, mergeDocuments, reportText, type Mark, type MarksDocument`. Append inside the describe:

```ts
const at = new Date("2026-10-24T09:30:00Z");
const stored = (id: string, over: Partial<Mark> = {}): Mark => ({
  ...quake,
  id,
  createdAt: "2026-10-21T00:00:00.000Z",
  ...over,
});

it("exports the document as versioned, dated JSON with a dated file name", () => {
  const doc: MarksDocument = {
    marks: [stored("a")],
    groups: [{ id: "g", name: "G", marks: ["a"] }],
  };
  const text = exportDocument(doc, at);
  expect(JSON.parse(text)).toEqual({ v: 1, exportedAt: "2026-10-24T09:30:00.000Z", ...doc });
  expect(text.startsWith("{\n")).toBe(true);
  expect(parseMarks(text)).toEqual(doc);
  expect(exportFileName(at)).toBe("tectonic-marks-2026-10-24.json");
});

it("merges what the incoming document adds and counts it", () => {
  const current: MarksDocument = {
    marks: [stored("a"), stored("b")],
    groups: [{ id: "g1", name: "One", marks: ["a"] }],
  };
  const incoming: MarksDocument = {
    marks: [stored("b", { name: "renamed" }), stored("c")],
    groups: [
      { id: "g1", name: "Other name", marks: ["a", "b", "c", "zz"] },
      { id: "g2", name: "Two", marks: ["c", "zz"] },
    ],
  };
  const { doc, report } = mergeDocuments(current, incoming);
  expect(doc.marks.map((m) => m.id)).toEqual(["a", "b", "c"]);
  expect(doc.marks[1]?.name).toBe("Kuril shock");
  expect(doc.groups).toEqual([
    { id: "g1", name: "One", marks: ["a", "b", "c"] },
    { id: "g2", name: "Two", marks: ["c"] },
  ]);
  expect(report).toEqual({ marks: 1, groups: 1, members: 2 });
  expect(mergeDocuments(doc, incoming).report).toEqual({ marks: 0, groups: 0, members: 0 });
});

it("words counts and reports", () => {
  expect(countsText({ marks: [], groups: [] })).toBe("0 marks, 0 groups");
  expect(countsText({ marks: [stored("a")], groups: [{ id: "g", name: "G", marks: [] }] })).toBe(
    "1 mark, 1 group",
  );
  expect(reportText({ marks: 3, groups: 1, members: 2 })).toBe(
    "Added 3 marks, 1 group, 2 memberships",
  );
  expect(reportText({ marks: 0, groups: 0, members: 1 })).toBe("Added 1 membership");
  expect(reportText({ marks: 0, groups: 0, members: 0 })).toBe("Nothing new");
});

it("reads, merges and replaces the stored document", () => {
  const m = memory();
  const s = createMarks(m.storage, deps());
  const a = s.add(quake);
  const g = s.addGroup("G");
  s.setMember(a.id, g.id, true);
  expect(s.document()).toEqual({ marks: s.marks.value, groups: s.groups.value });
  const r = s.merge({ marks: [stored("x")], groups: [{ id: g.id, name: "G", marks: ["x"] }] });
  expect(r).toEqual({ marks: 1, groups: 0, members: 1 });
  expect(s.marks.value.map((x) => x.id)).toEqual([a.id, "x"]);
  expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([a.id, "x"]);
  expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({
    marks: [{ id: a.id }, { id: "x" }],
  });
  s.replaceAll({ marks: [stored("y")], groups: [] });
  expect(s.marks.value.map((x) => x.id)).toEqual(["y"]);
  expect(s.groups.value).toEqual([]);
  expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({
    marks: [{ id: "y" }],
    groups: [],
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement the pure functions**

In `apps/web/src/lib/marks.ts`, after the `MarkView` interface:

```ts
/** The whole stored document: what `localStorage` holds and what an export file carries. */
export interface MarksDocument {
  marks: Mark[];
  groups: MarkGroup[];
}
/** What a merge added. */
export interface MergeReport {
  marks: number;
  groups: number;
  /** Members added to groups already present. */
  members: number;
}
```

Change `parseMarks`'s return type annotation to `MarksDocument`. Then, after `defaultName`, add:

```ts
/** The JSON text of a document as the export file carries it. */
export const exportDocument = (doc: MarksDocument, now: Date): string =>
  JSON.stringify(
    { v: 1, exportedAt: now.toISOString(), marks: doc.marks, groups: doc.groups },
    null,
    2,
  );

/** The export file's name for a given moment. */
export const exportFileName = (now: Date): string =>
  `tectonic-marks-${now.toISOString().slice(0, 10)}.json`;

/**
 * `current` plus what `incoming` has that it lacks: marks by id (appended in file order), groups
 * by id (appended), and for a group present in both, the members it lacks whose marks are known.
 * Names and order of what is already there are kept.
 */
export function mergeDocuments(
  current: MarksDocument,
  incoming: MarksDocument,
): { doc: MarksDocument; report: MergeReport } {
  const known = new Set(current.marks.map((m) => m.id));
  const newMarks = incoming.marks.filter((m) => !known.has(m.id));
  const marks = [...current.marks, ...newMarks];
  for (const m of newMarks) known.add(m.id);
  let members = 0;
  const groups = current.groups.map((g) => {
    const theirs = incoming.groups.find((x) => x.id === g.id);
    if (theirs === undefined) return g;
    const add = theirs.marks.filter((id) => known.has(id) && !g.marks.includes(id));
    members += add.length;
    return add.length === 0 ? g : { ...g, marks: [...g.marks, ...add] };
  });
  const newGroups = incoming.groups
    .filter((g) => !current.groups.some((x) => x.id === g.id))
    .map((g) => ({ ...g, marks: g.marks.filter((id) => known.has(id)) }));
  return {
    doc: { marks, groups: [...groups, ...newGroups] },
    report: { marks: newMarks.length, groups: newGroups.length, members },
  };
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** "3 marks, 1 group". */
export const countsText = (doc: MarksDocument): string =>
  `${plural(doc.marks.length, "mark")}, ${plural(doc.groups.length, "group")}`;

/** "Added 3 marks, 1 group, 2 memberships", zero parts left out; "Nothing new" when all are. */
export function reportText(r: MergeReport): string {
  const parts = [
    [r.marks, "mark"],
    [r.groups, "group"],
    [r.members, "membership"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, w]) => plural(n, w));
  return said.length === 0 ? "Nothing new" : `Added ${said.join(", ")}`;
}
```

- [ ] **Step 4: Extend the store**

In the `MarksStore` interface, after `moveGroup`:

```ts
  /** The document as stored. */
  document(): MarksDocument;
  /** Adds what the document has that the store lacks; returns what was added. */
  merge(doc: MarksDocument): MergeReport;
  /** Discards the stored document for this one. */
  replaceAll(doc: MarksDocument): void;
```

In the returned object, after `moveGroup(...)`:

```ts
    document: () => ({ marks: marks.value, groups: groups.value }),
    merge(doc) {
      const { doc: next, report } = mergeDocuments(
        { marks: marks.value, groups: groups.value },
        doc,
      );
      marks.value = next.marks;
      groups.value = next.groups;
      persist();
      return report;
    },
    replaceAll(doc) {
      marks.value = doc.marks;
      groups.value = doc.groups;
      persist();
    },
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @tectonic/web exec vitest run test/lib/marks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/marks.ts apps/web/test/lib/marks.test.ts
git commit -m "feat(web): the marks document can be exported, merged and replaced

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `MarksIO` in the rail footer

**Files:**

- Create: `apps/web/src/components/MarksIO.vue`
- Modify: `apps/web/src/components/MarksOverlay.vue` (render it at the foot of the rail)
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/components/MarksIO.test.ts`

**Interfaces:**

- Consumes: `MARKS`, `CLOCK` keys; `exportDocument`, `exportFileName`, `parseMarks`, `countsText`, `reportText`, `MarksDocument` from `marks.ts`; `ConfirmButton`.
- Produces: `RESULT_MS = 4000` export from the component's script (for tests), class names `.marks-io`, `.export`, `.import`, `.io-strip`, `.merge`, `.replace`, `.cancel`, `.io-result`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/components/MarksIO.test.ts
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarksIO, { RESULT_MS } from "../../src/components/MarksIO.vue";
import { exportDocument, type MarkDraft } from "../../src/lib/marks.js";
import { makeContext, mountWith } from "../support/mount.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/earthquakes/wc?event=us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
  mag: 5.5,
  depthKm: 10,
};

/** Feeds a file to the hidden input and fires change. */
async function pick(w: ReturnType<typeof mountWith>, text: string, name = "marks.json") {
  const input = w.find<HTMLInputElement>("input[type=file]");
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

describe("MarksIO", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("downloads the document as a dated JSON file", async () => {
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const create = vi.fn(() => "blob:marks");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("tectonic-marks-2026-10-13.json");
      expect(this.href).toContain("blob:marks");
    });
    const w = mountWith(MarksIO, ctx);
    await w.find(".export").trigger("click");
    expect(click).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("no blob");
    expect(await blob.text()).toBe(exportDocument(ctx.marks.document(), ctx.now));
    expect(revoke).toHaveBeenCalledWith("blob:marks");
    w.unmount();
  });

  it("imports by merge, reports, and clears the report after a while", async () => {
    vi.useFakeTimers();
    const ctx = await makeContext();
    const a = ctx.marks.add(quake);
    const file = exportDocument(
      {
        marks: [
          { ...quake, id: "x", ref: "us2", createdAt: "2026-10-01T00:00:00.000Z" },
          { ...quake, id: a.id, createdAt: a.createdAt },
        ],
        groups: [{ id: "g", name: "G", marks: ["x", a.id] }],
      },
      ctx.now,
    );
    const w = mountWith(MarksIO, ctx);
    const input = w.find<HTMLInputElement>("input[type=file]");
    const click = vi.spyOn(input.element, "click").mockImplementation(() => undefined);
    await w.find(".import").trigger("click");
    expect(click).toHaveBeenCalledTimes(1);
    await pick(w, file);
    expect(w.find(".io-strip").text()).toContain("marks.json: 2 marks, 1 group");
    await w.find(".merge").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).toEqual([a.id, "x"]);
    expect(ctx.marks.groups.value).toEqual([{ id: "g", name: "G", marks: ["x", a.id] }]);
    expect(w.find(".io-result").text()).toBe("Added 1 mark, 1 group");
    vi.advanceTimersByTime(RESULT_MS);
    await flushPromises();
    expect(w.find(".io-result").exists()).toBe(false);
    expect(w.find(".export").exists()).toBe(true);
    w.unmount();
  });

  it("replaces after an inline confirm, cancels, and refuses a file with nothing in it", async () => {
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const file = exportDocument(
      { marks: [{ ...quake, id: "y", createdAt: "2026-10-01T00:00:00.000Z" }], groups: [] },
      ctx.now,
    );
    const w = mountWith(MarksIO, ctx);
    await pick(w, file);
    await w.find(".cancel").trigger("click");
    expect(w.find(".io-strip").exists()).toBe(false);
    expect(ctx.marks.marks.value).toHaveLength(1);
    await pick(w, file);
    await w.find(".replace > button").trigger("click");
    await w.find(".replace button.yes").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).toEqual(["y"]);
    expect(w.find(".io-result").text()).toBe("Replaced with 1 mark, 0 groups");
    await pick(w, "not json", "notes.txt");
    expect(w.find(".io-result").text()).toBe("Not a marks file");
    await pick(w, "{}", "empty.json");
    expect(w.find(".io-result").text()).toBe("Not a marks file");
    w.unmount();
  });

  it("ignores a change event with no file", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarksIO, ctx);
    const input = w.find<HTMLInputElement>("input[type=file]");
    Object.defineProperty(input.element, "files", { value: [], configurable: true });
    await input.trigger("change");
    await flushPromises();
    expect(w.find(".io-strip").exists()).toBe(false);
    expect(w.find(".io-result").exists()).toBe(false);
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksIO.test.ts`
Expected: FAIL, cannot resolve `MarksIO.vue`.

- [ ] **Step 3: Write the component**

```vue
<!-- apps/web/src/components/MarksIO.vue -->
<script lang="ts">
/** How long the result line stays. */
export const RESULT_MS = 4000;
</script>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import { CLOCK, MARKS, useInjected } from "../lib/keys.js";
import {
  countsText,
  exportDocument,
  exportFileName,
  parseMarks,
  reportText,
  type MarksDocument,
} from "../lib/marks.js";

/** Export and import of the whole marks document, at the foot of the overlay's rail. */
const store = useInjected(MARKS);
const clock = useInjected(CLOCK);

/** A file read and parsed, waiting for Merge or Replace. */
const picked = ref<{ name: string; doc: MarksDocument } | null>(null);
const result = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
function report(text: string): void {
  picked.value = null;
  result.value = text;
  clearTimer();
  timer = setTimeout(() => {
    result.value = null;
    timer = null;
  }, RESULT_MS);
}

function exportAll(): void {
  const now = clock.now.value;
  const blob = new Blob([exportDocument(store.document(), now)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(now);
  a.click();
  URL.revokeObjectURL(url);
}

function chooseFile(): void {
  fileInput.value?.click();
}
async function onFile(e: Event): Promise<void> {
  const input = e.target instanceof HTMLInputElement ? e.target : null;
  const file = input?.files?.[0];
  if (file === undefined) return;
  const doc = parseMarks(await file.text());
  if (input !== null) input.value = "";
  if (doc.marks.length === 0 && doc.groups.length === 0) {
    report("Not a marks file");
    return;
  }
  result.value = null;
  picked.value = { name: file.name, doc };
}
function merge(doc: MarksDocument): void {
  report(reportText(store.merge(doc)));
}
function replace(doc: MarksDocument): void {
  store.replaceAll(doc);
  report(`Replaced with ${countsText(doc)}`);
}
function cancel(): void {
  picked.value = null;
}
onUnmounted(clearTimer);
</script>

<template>
  <div class="marks-io">
    <div v-if="picked !== null" class="io-strip">
      <span class="io-facts">{{ picked.name }}: {{ countsText(picked.doc) }}</span>
      <span class="io-actions">
        <button
          type="button"
          class="merge"
          title="Add what is missing, keep everything here"
          @click="merge(picked.doc)"
        >
          Merge
        </button>
        <ConfirmButton class="replace" label="Replace" @confirm="replace(picked.doc)" />
        <button type="button" class="cancel" @click="cancel">Cancel</button>
      </span>
    </div>
    <template v-else>
      <div v-if="result !== null" class="io-result" role="status">{{ result }}</div>
      <div class="io-buttons">
        <button
          type="button"
          class="export"
          title="Download every mark and group as a JSON file"
          @click="exportAll"
        >
          Export
        </button>
        <button
          type="button"
          class="import"
          title="Read a marks file and merge or replace"
          @click="chooseFile"
        >
          Import
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="io-file"
          aria-label="Marks file"
          @change="onFile"
        />
      </div>
    </template>
  </div>
</template>
```

Note the two `<script>` blocks: a plain one exporting `RESULT_MS`, and the `setup` one. Vue allows this and `vue-tsc` types the default export as the component.

- [ ] **Step 4: Mount it in the rail**

In `apps/web/src/components/MarksOverlay.vue`, import `MarksIO from "./MarksIO.vue"` (alphabetically after `MarkMatrix`), and add `<MarksIO />` as the last child of `<nav class="marks-rail">`, after the `+ New group` button / input.

- [ ] **Step 5: Styles**

Append to `apps/web/src/styles.css`, right after the `.marks-rail input {` rule block:

```css
.marks-io {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font: 13px var(--f-ui);
  color: var(--muted);
}
.marks-io .io-buttons {
  display: flex;
  gap: 4px;
}
.marks-io .io-file {
  display: none;
}
.marks-io .io-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--ink);
}
.marks-io .io-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.marks-io .io-actions button,
.marks-io .io-buttons button {
  border-color: var(--line);
}
```

In the `@media (max-width: 720px)` block, after the `.marks-rail button, .marks-rail input { white-space: nowrap; }` rule, add:

```css
.marks-io {
  margin-top: 0;
  margin-left: auto;
  padding-top: 0;
  border-top: 0;
  flex-direction: row;
  align-items: center;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @tectonic/web exec vitest run test/components/MarksIO.test.ts test/components/MarksOverlay.test.ts`
Expected: PASS. If happy-dom lacks `Blob.prototype.text`, replace `await blob.text()` in the test with `await new Response(blob).text()`; if `File.prototype.text` is missing in the component, read with a `FileReader` wrapped in a promise instead.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/MarksIO.vue apps/web/src/components/MarksOverlay.vue apps/web/src/styles.css apps/web/test/components/MarksIO.test.ts
git commit -m "feat(web): export and import of the marks document from the overlay rail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Docs, full gate and browser check

**Files:**

- Modify: `README.md` (Marked events bullet)
- Modify: `CLAUDE.md` (Marks bullet)

- [ ] **Step 1: README**

In `README.md`, in the **Marked events** bullet, after `and reopened with \`Open view\`.` add:

```
`Open here` instead selects the mark's event or volcano in the view you were in (region, window
and filters kept; the page switches to Active Earth only when it cannot show that kind, with a
short notice). Groups are reordered with the same `▲ ▼` in the group head. `Export` at the foot of
the group list downloads every mark and group as a JSON file (`tectonic-marks-<date>.json`);
`Import` reads one back and offers `Merge` (add what is missing, delete nothing) or `Replace`.
```

- [ ] **Step 2: CLAUDE.md**

In the `- Marks:` bullet of `CLAUDE.md`, after `open/list/show/close/goTo` write them.` add:

```
`openHere(mark)` pushes `hereTarget(page, region, query, mark)` from `src/lib/marks-nav.ts` (Active Earth when the page lacks the kind's panel) and posts to the `NOTICE` store (`src/lib/notice.ts`, `createNotice`, one `role=status` strip rendered by `App.vue`). `moveGroup` orders the rail; `MarksIO.vue` at the rail's foot exports `exportDocument` as `exportFileName(now)` and imports through `parseMarks` into `merge` (`mergeDocuments`, `MergeReport`) or `replaceAll`.
```

- [ ] **Step 3: Full gate**

Run from the repo root: `pnpm test:coverage && pnpm lint && pnpm typecheck`
Expected: all green, web coverage 100% on every column. Fix any gap with a test, never a threshold change.

- [ ] **Step 4: Browser check**

Run `pnpm dev` and, in Chrome on `http://localhost:5173/volcanoes/wc?marks=all`: mark an event first from the Earthquakes page, open the overlay on the Volcanoes page, click `Open here`, see the route become `/active/wc?...&event=...`, the notice appear and fade, and the event panel open. Create two groups, reorder them with the group-head arrows. Export, check the download name, delete a mark, import the file with Merge (the mark returns), then with Replace. Fix what looks wrong, commit as `fix(web): ...`.

- [ ] **Step 5: Commit the docs**

```bash
git add README.md CLAUDE.md
git commit -m "docs: marks tools in the README and CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push and open the pull request**

```bash
git push -u origin marks-tools
```

Open a PR from `marks-tools` into `main` titled `Marks tools: Open here, group order, export and import`, body summarising the three features and the notice store, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. (`gh` is not installed on this machine; use the GitHub web UI or `git push` output link.)
