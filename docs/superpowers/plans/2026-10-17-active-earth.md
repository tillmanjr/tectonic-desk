# Active Earth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third page, Active Earth, that shows earthquakes and volcanoes together, built on three improvements that also land on the single pages: eruption-relative offsets in the volcano panel, settings-driven card rows, and refinement bars with a collapsed state and a hide-markers toggle.

**Architecture:** Everything is in `apps/web`. Pure helpers (`offsetText`, `eruptionAnchor`, `parseSettings`, `quakeParts`, `volcanoParts`) live in `src/lib` with unit tests. The map logic shared by three maps moves into `src/lib/layers.ts` composables; `AnimationBar.vue` and `VolcanoLegendRows.vue` hold the template pieces. `ActiveEarthPage.vue` stacks existing sections and the new `CombinedMap.vue`. The spec is `docs/superpowers/specs/2026-10-17-active-earth-design.md`.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, vitest + @vue/test-utils under happy-dom, TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), typescript-eslint strict + stylistic, Prettier.

## Global Constraints

- Branch `active-earth` from `main`; four commits, one PR. Never commit to `main`.
- Coverage 100% on `apps/web/src` (statements, branches, functions, lines). Add a test, never lower it.
- No `as` casts and no `!` assertions in `src`; tests may use `as unknown as T` for stubs only.
- Imports of local files use the `.js` extension. Interfaces that tests spy on use function-typed properties.
- Run tests from `apps/web` with `npx vitest run` (the `pnpm --filter … exec vitest` form fails on this machine). Full gate before each commit: `npx vitest run --coverage` in `apps/web`, then `pnpm -s lint`, `pnpm -s typecheck`, `npx prettier --check apps/web README.md CLAUDE.md` from the repo root.
- Copy is for a geology-trained reader; no novice explanations.

---

### Task 1: Eruption-relative offsets in the volcano panel

**Files:**

- Modify: `apps/web/src/lib/format.ts` (add `offsetParts`, `offsetText`)
- Modify: `apps/web/src/lib/volcanoes.ts` (add `DatePrecision`, `EruptionAnchor`, `eruptionAnchor`)
- Modify: `apps/web/src/components/NearbyQuakes.vue`
- Test: `apps/web/test/lib/format.test.ts`, `apps/web/test/lib/volcanoes.test.ts`, create `apps/web/test/components/NearbyQuakes.test.ts`

**Interfaces:**

- Produces `offsetParts(from: Date, to: Date): OffsetParts`, `offsetText(from: Date, to: Date, precision?: DatePrecision): string`, `eruptionAnchor(eruptions: Eruption[]): EruptionAnchor | null`.

- [ ] **Step 1: Failing tests for the helpers**

Append to `apps/web/test/lib/format.test.ts` (import `offsetParts`, `offsetText`):

```ts
describe("offsets", () => {
  const d = (s: string) => new Date(s);
  it("splits a calendar difference into whole units, borrowing a month when needed", () => {
    expect(offsetParts(d("2021-09-19T00:00Z"), d("2024-01-25T13:40Z"))).toEqual({
      years: 2,
      months: 4,
      days: 6,
      hours: 13,
      minutes: 40,
    });
    expect(offsetParts(d("2026-03-31T00:00Z"), d("2026-04-29T00:00Z")).months).toBe(0);
    expect(offsetParts(d("2026-04-29T00:00Z"), d("2026-03-31T00:00Z")).days).toBe(29);
  });
  it("renders the two largest units at the given precision", () => {
    expect(offsetText(d("2021-09-19T00:00Z"), d("2024-01-25T13:40Z"))).toBe("2 y 4 mo");
    expect(offsetText(d("2026-09-01T00:00Z"), d("2026-10-10T06:00Z"))).toBe("1 mo 9 d");
    expect(offsetText(d("2026-10-07T00:00Z"), d("2026-10-10T05:12Z"))).toBe("3 d 5 h");
    expect(offsetText(d("2026-10-10T00:00Z"), d("2026-10-10T05:12Z"))).toBe("5 h 12 min");
    expect(offsetText(d("2026-10-10T00:00Z"), d("2026-10-10T00:40Z"))).toBe("40 min");
    expect(offsetText(d("2026-10-10T00:00:00Z"), d("2026-10-10T00:00:30Z"))).toBe("< 1 min");
    expect(offsetText(d("2021-09-01T00:00Z"), d("2024-01-25T00:00Z"), "month")).toBe("2 y 4 mo");
    expect(offsetText(d("2026-10-01T00:00Z"), d("2026-10-20T00:00Z"), "month")).toBe("< 1 mo");
    expect(offsetText(d("1857-01-01T00:00Z"), d("2026-10-10T00:00Z"), "year")).toBe("169 y");
    expect(offsetText(d("2026-01-01T00:00Z"), d("2026-10-10T00:00Z"), "year")).toBe("< 1 y");
  });
});
```

Append to the `classification` describe in `apps/web/test/lib/volcanoes.test.ts` (import `eruptionAnchor` and the `ERUPTIONS`, `eruption` fixtures):

```ts
it("anchors on the continuing eruption, else the latest, with the precision GVP gives", () => {
  const etna = ERUPTIONS.filter((e) => e.volcano === 211060);
  expect(eruptionAnchor(etna)).toEqual({
    date: new Date("2022-11-27T00:00:00Z"),
    precision: "day",
    continuing: true,
    label: "2022-11-27",
  });
  const helens = ERUPTIONS.filter((e) => e.volcano === 321050);
  expect(eruptionAnchor(helens)).toMatchObject({
    date: new Date("1857-01-01T00:00:00Z"),
    precision: "year",
    continuing: false,
    label: "1857",
  });
  expect(
    eruptionAnchor([
      eruption({ startYear: 1980, startMonth: 5, startDay: null, continuing: false }),
    ]),
  ).toMatchObject({ date: new Date("1980-05-01T00:00:00Z"), precision: "month" });
  expect(eruptionAnchor([eruption({ startYear: -6190, continuing: false })])).toBeNull();
  expect(eruptionAnchor([])).toBeNull();
});
```

- [ ] **Step 2: Run them, expect failures on missing exports**

Run: `cd apps/web && npx vitest run test/lib/format.test.ts test/lib/volcanoes.test.ts`

- [ ] **Step 3: Implement the helpers**

`format.ts`:

```ts
export type DatePrecision = "day" | "month" | "year";
export interface OffsetParts {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
}
const addMonths = (d: Date, n: number): Date =>
  new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + n,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );

/** The calendar difference between two instants in UTC as whole units; the order of the arguments does not matter. */
export function offsetParts(from: Date, to: Date): OffsetParts {
  const [a, b] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  let total = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (addMonths(a, total).getTime() > b.getTime()) total -= 1;
  const rest = b.getTime() - addMonths(a, total).getTime();
  return {
    years: Math.floor(total / 12),
    months: total % 12,
    days: Math.floor(rest / 864e5),
    hours: Math.floor((rest % 864e5) / 36e5),
    minutes: Math.floor((rest % 36e5) / 6e4),
  };
}

/** The two largest non-zero units of the difference, down to the precision: "2 y 4 mo", "1 mo 9 d", "3 d 5 h", "< 1 mo". */
export function offsetText(from: Date, to: Date, precision: DatePrecision = "day"): string {
  const p = offsetParts(from, to);
  const all: [number, string][] = [
    [p.years, "y"],
    [p.months, "mo"],
    [p.days, "d"],
    [p.hours, "h"],
    [p.minutes, "min"],
  ];
  const units = all.slice(0, precision === "year" ? 1 : precision === "month" ? 2 : 5);
  const first = units.findIndex(([n]) => n > 0);
  if (first < 0) return `< 1 ${units[units.length - 1]?.[1] ?? "min"}`;
  return units
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${String(n)} ${u}`)
    .join(" ");
}
```

`volcanoes.ts` (import `DatePrecision` from `./format.js`):

```ts
export interface EruptionAnchor {
  date: Date;
  precision: DatePrecision;
  continuing: boolean;
  label: string;
}
const startMs = (e: Eruption): number =>
  Date.UTC(e.startYear, (e.startMonth ?? 1) - 1, e.startDay ?? 1);
const latestOf = (list: Eruption[]): Eruption | null =>
  list.reduce<Eruption | null>((a, e) => (a === null || startMs(e) > startMs(a) ? e : a), null);

/** The eruption a volcano's seismicity is dated against: the continuing one with the latest start, else the latest start; CE dates only. */
export function eruptionAnchor(eruptions: Eruption[]): EruptionAnchor | null {
  const dated = eruptions.filter((e) => e.startYear > 0);
  const pick = latestOf(dated.filter((e) => e.continuing)) ?? latestOf(dated);
  if (pick === null) return null;
  return {
    date: new Date(startMs(pick)),
    precision: pick.startMonth === null ? "year" : pick.startDay === null ? "month" : "day",
    continuing: pick.continuing,
    label: eruptionStart(pick),
  };
}
```

- [ ] **Step 4: Failing component test**

Create `apps/web/test/components/NearbyQuakes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import NearbyQuakes from "../../src/components/NearbyQuakes.vue";
import { fakeApi, listOf } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { volcano, VOLCANOES } from "../support/volcanoes.js";

const etna = volcano();
const near = (over: Record<string, unknown>) =>
  event({ latitude: 37.75, longitude: 15.0, mag: 4.1, ...over });

describe("NearbyQuakes", () => {
  it("dates nearby quakes against the eruption onset, before, after and within its granule", async () => {
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue(
          listOf([
            near({ id: "after", time: "2026-10-10T00:00:00Z", mag: 4.6 }),
            near({ id: "before", time: "2022-11-20T00:00:00Z", mag: 4.3 }),
            near({ id: "same", time: "2022-11-27T10:00:00Z", mag: 4.0 }),
            event({ id: "far", latitude: -20, longitude: -175, mag: 7 }),
          ]),
        ),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const w = mountWith(NearbyQuakes, ctx, { volcano: etna });
    expect(w.find(".cap").text()).toBe(
      "Relative to the eruption that began 2022-11-27, continuing · 3 in the loaded window; the largest:",
    );
    const items = w.findAll("li").map((li) => li.text());
    expect(items[0]).toContain("3 y 10 mo after onset");
    expect(items[1]).toContain("7 d before onset");
    expect(items[2]).toContain("in the onset day");
    await w.find("li button").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("after");
  });
  it("says about for a coarse onset and falls back to ago without an eruption record", async () => {
    const helens = VOLCANOES[1];
    const clearLake = VOLCANOES[4];
    if (helens === undefined || clearLake === undefined) throw new Error("fixture");
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue(
          listOf([
            event({
              id: "h",
              latitude: helens.lat,
              longitude: helens.lon,
              time: "2026-10-10T00:00:00Z",
            }),
            event({
              id: "c",
              latitude: clearLake.lat,
              longitude: clearLake.lon,
              time: "2026-10-10T00:00:00Z",
            }),
          ]),
        ),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const h = mountWith(NearbyQuakes, ctx, { volcano: helens });
    expect(h.find(".cap").text()).toContain("began about 1857");
    expect(h.find("li").text()).toContain("169 y after onset");
    const c = mountWith(NearbyQuakes, ctx, { volcano: clearLake });
    expect(c.find(".cap").text()).toBe("1 in the loaded window; the largest:");
    expect(c.find("li").text()).toContain("3.5 d ago");
  });
});
```

Check `test/support/api.ts` exports `listOf`; if it is local to a test file, export it from the support module (FilterBar.test has its own copy; leave that).

- [ ] **Step 5: Implement `NearbyQuakes.vue`**

```vue
<script setup lang="ts">
import type { ApiEvent, Volcano } from "@tectonic/shared";
import { computed } from "vue";
import { ago, fmtMag, offsetText, placeOf, type DatePrecision } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, VOLCANOES } from "../lib/keys.js";
import { distanceKm, eruptionAnchor } from "../lib/volcanoes.js";

/** Earthquakes of the loaded window within reach of a volcano, largest first. */
const NEARBY_KM = 50;
const TOP = 3;

const props = defineProps<{ volcano: Volcano }>();
const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const store = useInjected(VOLCANOES);

const magOf = (e: ApiEvent): number => e.mag ?? -1;

const near = computed(() => {
  const { lat, lon } = props.volcano;
  const close = catalog.filtered.value.filter(
    (e) => distanceKm(lat, lon, e.latitude, e.longitude) <= NEARBY_KM,
  );
  const top = [...close].sort((a, b) => magOf(b) - magOf(a)).slice(0, TOP);
  return { count: close.length, top };
});
/** The eruption the offsets are measured from, when the GVP record has one. */
const anchor = computed(() => eruptionAnchor(store.eruptionsFor(props.volcano.number)));
const anchorText = computed(() => {
  const a = anchor.value;
  if (a === null) return "";
  const began = a.precision === "day" ? `began ${a.label}` : `began about ${a.label}`;
  return `Relative to the eruption that ${began}${a.continuing ? ", continuing" : ""} · `;
});
const granule = (d: Date, p: DatePrecision): string =>
  d.toISOString().slice(0, p === "year" ? 4 : p === "month" ? 7 : 10);
/** "1 mo 9 d after onset", "in the onset day", or today's "5.6 d ago" without an anchor. */
function when(e: ApiEvent): string {
  const a = anchor.value;
  if (a === null) return `${ago(e.time, clock.now.value)} ago`;
  const t = new Date(e.time);
  if (granule(t, a.precision) === granule(a.date, a.precision))
    return `in the onset ${a.precision}`;
  const side = t.getTime() < a.date.getTime() ? "before" : "after";
  return `${offsetText(a.date, t, a.precision)} ${side} onset`;
}
</script>

<template>
  <h3>Earthquakes within {{ NEARBY_KM }} km</h3>
  <p v-if="near.count === 0" class="note">None in the loaded window and filter.</p>
  <template v-else>
    <p class="cap">{{ anchorText }}{{ near.count }} in the loaded window; the largest:</p>
    <ul class="erlist">
      <li v-for="e in near.top" :key="e.id">
        <button type="button" class="linkbtn" @click="select(e.id)">
          M{{ fmtMag(e.mag) }} · {{ placeOf(e) }} · {{ when(e) }}
        </button>
      </li>
    </ul>
  </template>
</template>
```

- [ ] **Step 6: Run the web suite, fix the `VolcanoDetail` test if it asserted the old `ago` wording, then the full gate**
- [ ] **Step 7: Commit** `feat(web): date nearby earthquakes against the eruption onset`

---

### Task 2: Settings store and card rows

**Files:**

- Create: `apps/web/src/lib/settings.ts`, `apps/web/src/components/CardGrid.vue`
- Modify: `apps/web/src/lib/keys.ts` (`SETTINGS`), `apps/web/src/components/App.vue`, `apps/web/test/support/mount.ts`, `apps/web/src/components/MajorEvents.vue`, `apps/web/src/components/VolcanoCards.vue`, `apps/web/src/components/EarthquakesPage.vue`, `apps/web/src/components/VolcanoesPage.vue`, `apps/web/src/styles.css`
- Test: create `apps/web/test/lib/settings.test.ts`, `apps/web/test/components/CardGrid.test.ts`; update `MajorEvents.test.ts`, `VolcanoPanels.test.ts`, `VolcanoesPage.test.ts`, `App.test.ts` as their label and card-count assertions require

**Interfaces:**

- Produces `Settings`, `DEFAULT_SETTINGS`, `SETTINGS_KEY`, `parseSettings(raw: string | null): Settings`, `createSettings(storage?: StorageLike | null): SettingsStore` with `{ current: Readonly<Ref<Settings>>; set(next: Settings): void }`; `SETTINGS: InjectionKey<SettingsStore>`; `CardGrid` props `{ label: string; count: number; rows: number | null }` with a scoped default slot `{ limit: number | null }`; `MajorEvents` and `VolcanoCards` prop `rows?: number | null` (default `null`).

- [ ] **Step 1: Failing settings test** (`test/lib/settings.test.ts`)

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createSettings,
  DEFAULT_SETTINGS,
  parseSettings,
  SETTINGS_KEY,
} from "../../src/lib/settings.js";

describe("settings", () => {
  it("parses stored settings field by field with defaults for anything off", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[]")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"cardRows":{"alone":2,"combined":0}}').cardRows).toEqual({
      alone: 2,
      combined: 1,
    });
    expect(parseSettings('{"cardRows":{"alone":21,"combined":"3"}}').cardRows).toEqual({
      alone: 3,
      combined: 1,
    });
  });
  it("reads storage once, writes on set, and survives storage that throws", () => {
    const store = new Map<string, string>([[SETTINGS_KEY, '{"cardRows":{"alone":5}}']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const s = createSettings(storage);
    expect(s.current.value.cardRows).toEqual({ alone: 5, combined: 1 });
    s.set({ cardRows: { alone: 2, combined: 2 } });
    expect(store.get(SETTINGS_KEY)).toBe('{"cardRows":{"alone":2,"combined":2}}');
    const broken = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("full");
      }),
    };
    const b = createSettings(broken);
    expect(b.current.value).toEqual(DEFAULT_SETTINGS);
    b.set({ cardRows: { alone: 1, combined: 1 } });
    expect(b.current.value.cardRows.alone).toBe(1);
    expect(createSettings(null).current.value).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Implement `settings.ts`**

```ts
import { ref, type Ref } from "vue";

export interface Settings {
  /** Rows of major-event and volcano cards shown before "… N more": alone on a page, or with the other dataset. */
  cardRows: { alone: number; combined: number };
}

export const DEFAULT_SETTINGS: Settings = { cardRows: { alone: 3, combined: 1 } };
export const SETTINGS_KEY = "tectonic.settings";
const MAX_ROWS = 20;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const rowsOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_ROWS ? v : fallback;

/** Settings from their stored JSON; each field falls back on its own when missing or malformed. */
export function parseSettings(raw: string | null): Settings {
  let parsed: unknown = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const root = isRecord(parsed) ? parsed : {};
  const cr = isRecord(root.cardRows) ? root.cardRows : {};
  return {
    cardRows: {
      alone: rowsOr(cr.alone, DEFAULT_SETTINGS.cardRows.alone),
      combined: rowsOr(cr.combined, DEFAULT_SETTINGS.cardRows.combined),
    },
  };
}

export interface SettingsStore {
  current: Readonly<Ref<Settings>>;
  set(next: Settings): void;
}

/** Reader-tunable settings, persisted in localStorage; no editor yet. */
export function createSettings(storage: StorageLike | null = localStorage): SettingsStore {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    raw = null;
  }
  const current = ref<Settings>(parseSettings(raw));
  return {
    current,
    set(next) {
      current.value = next;
      try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // storage full or disabled; the change still applies for this page
      }
    },
  };
}
```

`keys.ts`: `export const SETTINGS: InjectionKey<SettingsStore> = Symbol("settings");`. `App.vue`: `const settings = inject(SETTINGS, null) ?? createSettings(); provide(SETTINGS, settings);`. `mount.ts`: add `settings: SettingsStore` to `Context`, created with `createSettings(null)`, and `provide(SETTINGS, ctx.settings)`. In `App.test.ts` `mountApp`, `provide(SETTINGS, createSettings(null))` so the fallback branch is covered by the existing "falls back to a real api client" test and the provided branch by every other.

- [ ] **Step 3: Failing `CardGrid` test**

```ts
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import CardGrid from "../../src/components/CardGrid.vue";
import { makeContext, mountWith } from "../support/mount.js";

const columns = (n: number) =>
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    gridTemplateColumns: Array<string>(n).fill("250px").join(" "),
  } as unknown as CSSStyleDeclaration);

describe("CardGrid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("limits the slot to rows × columns, offers the rest, and resets on a region change", async () => {
    columns(4);
    const ctx = await makeContext();
    const w = mountWith(
      {
        setup: () => () =>
          h(
            CardGrid,
            { label: "Major", count: 10, rows: 2 },
            {
              default: (s: { limit: number | null }) => h("i", String(s.limit)),
            },
          ),
      },
      ctx,
    );
    expect(w.find(".sectionlabel").text()).toBe("Major … 2 more");
    expect(w.find("i").text()).toBe("8");
    await w.find(".more").trigger("click");
    expect(w.find("i").text()).toBe("null");
    expect(w.find(".more").text()).toBe("show fewer");
    expect(w.find(".more").attributes("aria-expanded")).toBe("true");
    columns(2);
    window.dispatchEvent(new Event("resize"));
    await ctx.catalog.setRegion("wc");
    await nextTick();
    expect(w.find("i").text()).toBe("4");
    expect(w.find(".sectionlabel").text()).toBe("Major … 6 more");
    w.unmount();
  });
  it("shows everything with no rows limit or when nothing overflows", async () => {
    const ctx = await makeContext();
    const all = mountWith(CardGrid, ctx, { label: "All", count: 3, rows: null });
    expect(all.find(".more").exists()).toBe(false);
    const fits = mountWith(CardGrid, ctx, { label: "Fits", count: 1, rows: 3 });
    expect(fits.find(".more").exists()).toBe(false);
    expect(fits.find(".sectionlabel").text()).toBe("Fits");
  });
});
```

(`mountWith` accepts a `Component`; the inline `{ setup }` object qualifies.)

- [ ] **Step 4: Implement `CardGrid.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { CATALOG, useInjected } from "../lib/keys.js";

/**
 * A labelled card grid clipped to `rows` rows: the slot gets `limit`, how
 * many cards to render (null for all), and the label offers the rest.
 */
const props = defineProps<{ label: string; count: number; rows: number | null }>();
const catalog = useInjected(CATALOG);
const el = ref<HTMLElement | null>(null);
const columns = ref(1);
const expanded = ref(false);

function measure(): void {
  const node = el.value;
  if (node === null) return;
  const cols = getComputedStyle(node)
    .gridTemplateColumns.split(" ")
    .filter((c) => c !== "");
  columns.value = Math.max(1, cols.length);
}
const limit = computed(() =>
  props.rows === null || expanded.value ? null : props.rows * columns.value,
);
const hidden = computed(() => (limit.value === null ? 0 : Math.max(0, props.count - limit.value)));

watch(
  () => catalog.region.value?.id,
  () => {
    expanded.value = false;
  },
);
onMounted(() => {
  measure();
  window.addEventListener("resize", measure);
});
onUnmounted(() => {
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <p class="sectionlabel">
    {{ label }}
    <button
      v-if="hidden > 0 || expanded"
      type="button"
      class="more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? "show fewer" : `… ${String(hidden)} more` }}
    </button>
  </p>
  <section ref="el" class="major"><slot :limit="limit"></slot></section>
</template>
```

Add to `styles.css` after `.sectionlabel`:

```css
.sectionlabel .more {
  margin-left: 8px;
  font: 600 11px var(--f-ui);
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--muted);
  background: none;
  border: 0;
  border-bottom: 1px dotted var(--muted);
  padding: 0;
  cursor: pointer;
}
```

- [ ] **Step 5: Wire the cards and pages**

`MajorEvents.vue`: `const props = withDefaults(defineProps<{ rows?: number | null }>(), { rows: null });` and the template becomes

```vue
<CardGrid
  v-slot="{ limit }"
  :label="majorLabel(catalog.requireRegion())"
  :count="cards.length"
  :rows="props.rows"
>
  <p v-if="cards.length === 0" class="note">No events meet the threshold in this window.</p>
  <button v-for="c in cards.slice(0, limit ?? cards.length)" …>…</button>
</CardGrid>
```

`VolcanoCards.vue` likewise with label `Elevated or changed in the last 7 days` and `count="store.attention.value.length"`. `EarthquakesPage.vue`: drop the `<p class="sectionlabel">`, inject `SETTINGS`, `<MajorEvents :rows="settings.current.value.cardRows.alone" />`. `VolcanoesPage.vue`: same for `VolcanoCards`. Update tests that looked for the label in the page (`VolcanoesPage.test.ts:36`) or counted cards under the page with more than three rows' worth (none expected at one column: 3 rows × 1 column = 3 cards; fixtures with more than three major events will clip, so pass `rows: null` in component tests or assert the clipped count in page tests).

- [ ] **Step 6: Full gate, commit** `feat(web): settings store and card rows with a "more" control`

---

### Task 3: Refinement bars with a collapsed state and hide-markers toggles

**Files:**

- Create: `apps/web/src/lib/refine.ts`, `apps/web/src/components/RefineBar.vue`
- Modify: `apps/web/src/lib/catalog.ts` (`hideMarkers`), `apps/web/src/lib/volcanoes.ts` (`hideMarkers`), `apps/web/src/components/FilterBar.vue`, `apps/web/src/components/VolcanoFilterBar.vue`, `apps/web/src/components/QuakeMap.vue`, `apps/web/src/components/VolcanoMap.vue`, `apps/web/src/styles.css`
- Test: create `apps/web/test/lib/refine.test.ts`, `apps/web/test/components/RefineBar.test.ts`; update `FilterBar.test.ts`, `VolcanoPanels.test.ts`, `QuakeMap.test.ts`, `VolcanoMap.test.ts`, `App.test.ts`, `VolcanoesPage.test.ts` to expand the bar (`await w.find(".rtoggle").trigger("click")`) before reaching inputs

**Interfaces:**

- Produces `SummaryPart { text: string; set: boolean }`, `quakeParts(filter: EventFilter, span: DateSpan, requested: number, spanLabel: string | null): SummaryPart[]`, `volcanoParts(filter: VolcanoFilter): SummaryPart[]`; `RefineBar` props `{ dataset: "earthquakes" | "volcanoes"; parts: SummaryPart[]; hidden: boolean }`, emit `update:hidden`, slots `default`, `info`, `note`; `catalog.hideMarkers: Ref<boolean>`, `volcanoes.hideMarkers: Ref<boolean>`.

- [ ] **Step 1: Failing `refine` test**

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { quakeParts, volcanoParts } from "../../src/lib/refine.js";
import { EMPTY_VOLCANO_FILTER } from "../../src/lib/volcanoes.js";

const span = { since: "2026-07-19", until: "2026-10-17" };

describe("refine summaries", () => {
  it("describes the earthquake filter, marking what is set", () => {
    expect(quakeParts(EMPTY_FILTER, span, 4.5, "90 days")).toEqual([
      { text: "M4.5+", set: false },
      { text: "90 days from 2026-07-19 to 2026-10-17", set: false },
      { text: "depth any", set: false },
    ]);
    expect(
      quakeParts(
        { ...EMPTY_FILTER, minMag: 5, maxMag: 6, minDepth: 10, maxDepth: 200, since: "2026-07-19" },
        span,
        5,
        null,
      ),
    ).toEqual([
      { text: "M5 to M6", set: true },
      { text: "custom from 2026-07-19 to 2026-10-17", set: true },
      { text: "depth 10–200 km", set: true },
    ]);
    expect(quakeParts({ ...EMPTY_FILTER, minDepth: 10 }, span, 4.5, "90 days")[2]).toEqual({
      text: "depth from 10 km",
      set: true,
    });
    expect(quakeParts({ ...EMPTY_FILTER, maxDepth: 70 }, span, 4.5, "90 days")[2]).toEqual({
      text: "depth to 70 km",
      set: true,
    });
  });
  it("describes the volcano filter with the group labels", () => {
    expect(volcanoParts(EMPTY_VOLCANO_FILTER)).toEqual([
      { text: "setting any", set: false },
      { text: "type any", set: false },
      { text: "last eruption any", set: false },
      { text: "status any", set: false },
    ]);
    expect(
      volcanoParts({ setting: "subduction", type: "strato", age: "recent", status: "elevated" }),
    ).toEqual([
      { text: "setting subduction", set: true },
      { text: "type stratovolcano", set: true },
      { text: "last eruption since 1900", set: true },
      { text: "status elevated", set: true },
    ]);
  });
});
```

Use the real codes and labels from `volcanoes.ts` (`SETTING_GROUPS`, `TYPE_GROUPS`, `ERUPTION_CLASSES[...].label`, `STATUS_FILTERS`); adjust the expected strings to those labels, lower-cased where the label is a sentence word.

- [ ] **Step 2: Implement `refine.ts`**

```ts
import { hasRange, type DateSpan, type EventFilter } from "./filters.js";
import { fmtFloor } from "./format.js";
import {
  ERUPTION_CLASSES,
  SETTING_GROUPS,
  STATUS_FILTERS,
  TYPE_GROUPS,
  type VolcanoFilter,
} from "./volcanoes.js";

/** One clause of a collapsed refine bar; `set` means the reader chose it rather than a default. */
export interface SummaryPart {
  text: string;
  set: boolean;
}

export function quakeParts(
  f: EventFilter,
  span: DateSpan,
  requested: number,
  spanLabel: string | null,
): SummaryPart[] {
  const mag =
    f.maxMag === null ? fmtFloor(requested) : `M${String(requested)} to M${String(f.maxMag)}`;
  const depth =
    f.minDepth !== null && f.maxDepth !== null
      ? `depth ${String(f.minDepth)}–${String(f.maxDepth)} km`
      : f.minDepth !== null
        ? `depth from ${String(f.minDepth)} km`
        : f.maxDepth !== null
          ? `depth to ${String(f.maxDepth)} km`
          : "depth any";
  return [
    { text: mag, set: f.minMag !== null || f.maxMag !== null },
    { text: `${spanLabel ?? "custom"} from ${span.since} to ${span.until}`, set: hasRange(f) },
    { text: depth, set: f.minDepth !== null || f.maxDepth !== null },
  ];
}

export function volcanoParts(f: VolcanoFilter): SummaryPart[] {
  const part = (name: string, label: string | null): SummaryPart => ({
    text: `${name} ${label ?? "any"}`,
    set: label !== null,
  });
  return [
    part("setting", f.setting === null ? null : SETTING_GROUPS[f.setting].toLowerCase()),
    part("type", f.type === null ? null : TYPE_GROUPS[f.type].toLowerCase()),
    part("last eruption", f.age === null ? null : ERUPTION_CLASSES[f.age].label.toLowerCase()),
    part("status", f.status === null ? null : STATUS_FILTERS[f.status].toLowerCase()),
  ];
}
```

(If `VolcanoFilter` fields are plain `string | null`, index through the `*_CODES` arrays with a `find` instead of direct indexing.)

- [ ] **Step 3: Failing `RefineBar` test**

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RefineBar from "../../src/components/RefineBar.vue";

describe("RefineBar", () => {
  it("collapses to a summary, expands on the toggle, and reports the hide checkbox", async () => {
    const w = mount(RefineBar, {
      props: {
        dataset: "volcanoes",
        parts: [
          { text: "setting any", set: false },
          { text: "status elevated", set: true },
        ],
        hidden: false,
      },
      slots: { default: "<input class='inner' />", note: "<p class='fnote'>note</p>" },
    });
    expect(w.classes()).toContain("volcanoes");
    expect(w.find(".rwho").text()).toBe("volcanoes");
    expect(w.find(".rsummary").text()).toBe("setting any · status elevated");
    expect(w.findAll(".rsummary .set").map((s) => s.text())).toEqual(["status elevated"]);
    expect(w.find(".inner").exists()).toBe(false);
    expect(w.find(".fnote").text()).toBe("note");
    const toggle = w.find(".rtoggle");
    expect(toggle.text()).toBe("edit");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");
    expect(toggle.text()).toBe("done");
    expect(w.find(".inner").exists()).toBe(true);
    expect(w.find(".rsummary").exists()).toBe(false);
    expect(w.find(".fnote").exists()).toBe(true);
    await w.find(".rhide input").setValue(true);
    expect(w.emitted("update:hidden")).toEqual([[true]]);
    const stray = new Event("change");
    Object.defineProperty(stray, "target", { value: document.createElement("div") });
    w.find(".rhide input").element.dispatchEvent(stray);
    expect(w.emitted("update:hidden")).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Implement `RefineBar.vue`**

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { SummaryPart } from "../lib/refine.js";

/**
 * The frame of a refine bar: collapsed it states the refinements in force,
 * expanded it shows the inputs in the default slot. The hide checkbox only
 * takes this dataset's markers off the map.
 */
const props = defineProps<{
  dataset: "earthquakes" | "volcanoes";
  parts: SummaryPart[];
  hidden: boolean;
}>();
const emit = defineEmits<{ "update:hidden": [value: boolean] }>();
const expanded = ref(false);
const bodyId = `refine-${props.dataset}`;
function onHide(ev: Event): void {
  const t = ev.target;
  if (t instanceof HTMLInputElement) emit("update:hidden", t.checked);
}
</script>

<template>
  <section
    class="filters refine"
    :class="[dataset, { expanded }]"
    :aria-label="`Refine ${dataset}`"
  >
    <span class="ftitle">Refine</span>
    <span class="rwho">{{ dataset }}</span>
    <span v-if="!expanded" class="rsummary"
      ><template v-for="(p, i) in parts" :key="i"
        ><span v-if="i > 0" class="rsep"> · </span
        ><span :class="{ set: p.set }">{{ p.text }}</span></template
      ></span
    >
    <button
      type="button"
      class="rtoggle"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="expanded = !expanded"
    >
      {{ expanded ? "done" : "edit" }}
    </button>
    <slot name="info"></slot>
    <label class="rhide"
      ><input type="checkbox" :checked="hidden" @change="onHide" /> Hide markers</label
    >
    <template v-if="expanded">
      <span class="rbreak"></span>
      <div :id="bodyId" class="rbody"><slot></slot></div>
    </template>
    <slot name="note"></slot>
  </section>
</template>
```

Styles:

```css
.filters.refine {
  border-left: 3px solid var(--accent);
}
.filters.refine.volcanoes {
  border-left-color: var(--vc-recent);
}
.filters .rwho {
  color: var(--muted);
  font-weight: 600;
  margin-right: 4px;
}
.filters .rsummary {
  color: var(--muted);
}
.filters .rsummary .set {
  color: var(--ink);
  font-weight: 600;
}
.filters .rtoggle {
  font: 700 11px var(--f-ui);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  background: none;
  border: 0;
  padding: 2px 4px;
  cursor: pointer;
}
.filters .rhide {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--muted);
  font-size: 12.5px;
  white-space: nowrap;
}
.filters .rbreak {
  flex-basis: 100%;
  height: 0;
}
.filters .rbody {
  display: contents;
}
```

- [ ] **Step 5: Stores and bars**

`catalog.ts`: add `hideMarkers: Ref<boolean>` to `Catalog` and `const hideMarkers = ref(false)` returned. `volcanoes.ts`: the same on `VolcanoStore`. `FilterBar.vue`: compute `parts = quakeParts(catalog.filter.value, span.value, catalog.requested.value, preset.value?.label ?? null)`; template:

```vue
<RefineBar
  dataset="earthquakes"
  :parts="parts"
  :hidden="catalog.hideMarkers.value"
  @update:hidden="catalog.hideMarkers.value = $event"
>
  <template #info>
    <span class="finfo" role="img" aria-label="…" title="…">i</span>
  </template>
  <span class="flabel">Magnitude</span> … (the inputs, the Window select and dates, Reset, unchanged)
  <template #note><p v-if="note !== null" class="fnote">{{ note }}</p></template>
</RefineBar>
```

`VolcanoFilterBar.vue` the same with `dataset="volcanoes"`, `volcanoParts(store.filter.value)`, `store.hideMarkers`. `QuakeMap.vue`: `<MapEvents v-if="!catalog.hideMarkers.value" …>`; `VolcanoMap.vue`: `<MapVolcanoes v-if="!store.hideMarkers.value" …>`. Add to the map tests: tick the hide box on the bar in a page-level test (`VolcanoesPage` and a new `EarthquakesPage` assertion in `App.test`) and assert the marker component is gone while `.mapcount` and the table are unchanged.

- [ ] **Step 6: Update tests that reach into the bars, full gate, commit** `feat(web): refine bars collapse to a summary and can hide a dataset's markers`

---

### Task 4: Active Earth page

**Files:**

- Modify: `apps/web/src/router.ts`, `apps/web/src/components/PageSwitch.vue`, `apps/web/src/components/App.vue`, `apps/web/src/components/QuakeMap.vue`, `apps/web/src/components/VolcanoMap.vue`
- Create: `apps/web/src/lib/layers.ts`, `apps/web/src/components/AnimationBar.vue`, `apps/web/src/components/VolcanoLegendRows.vue`, `apps/web/src/components/CombinedMap.vue`, `apps/web/src/components/ActiveEarthPage.vue`
- Test: `router.test.ts`, `VolcanoesPage.test.ts` (PageSwitch labels), create `CombinedMap.test.ts`, `ActiveEarthPage.test.ts`, extend `App.test.ts`
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**

- Produces `Page = "earthquakes" | "volcanoes" | "active"`, `hasVolcanoes(page: Page): boolean`; `useQuakeLayer({ catalog, clock, zone, mv }): QuakeLayer`, `useVolcanoLayer({ store, mv }): VolcanoLayer`; `AnimationBar` props `{ anim: Animation; shown: number; total: number }`; `CombinedMap` prop `animate?: boolean`.

- [ ] **Step 1: Router and switch (test first)**

`router.test.ts` adds: `/active/wc` resolves with `meta.page === "active"` and `params.region === "wc"`; `pageBase("active") === "/active"`; `pagePath("active", "global") === "/active"`; `hasVolcanoes` true for `volcanoes` and `active`, false for `earthquakes`. `router.ts`:

```ts
export type Page = "earthquakes" | "volcanoes" | "active";
// routes: { path: "/active/:region?", component: App, meta: { page: "active" } } before "/volcanoes/:region?"
export const pageBase = (page: Page): string =>
  page === "volcanoes" ? "/volcanoes" : page === "active" ? "/active" : "";
/** Pages that show the volcano dataset and therefore load its store. */
export const hasVolcanoes = (page: Page): boolean => page !== "earthquakes";
```

`PageSwitch.vue`: add `{ id: "active", label: "Active Earth" }`; its test expects three labels. `App.vue`: `page` computed maps `route.meta.page` through a small `pageOf(meta: unknown): Page` (`"volcanoes"` and `"active"` pass through, anything else is `"earthquakes"`); every `page.value === "volcanoes"` check becomes `hasVolcanoes(page.value)`; `select()` deletes `query.volcano`, `selectVolcano()` deletes `query.event`; template renders `ActiveEarthPage` for `active`.

- [ ] **Step 2: Extract the layers (no behaviour change)**

`src/lib/layers.ts`:

```ts
import type { ApiEvent, ApiEventGrid, Volcano } from "@tectonic/shared";
import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";
import { createAnimation, DAY_MS, type Animation } from "./animation.js";
import type { Catalog } from "./catalog.js";
import type { Clock } from "./clock.js";
import { densityLegendFor, type DensityLegend } from "./density.js";
import { fmtFloor, fmtInt, fmtMag, fmtShort, placeOf, type Zone } from "./format.js";
import { TIP_LIFT, type MapView } from "./mapview.js";
import {
  aviationColor,
  lastEruptionText,
  statusLabel,
  statusRank,
  TYPE_GROUPS,
  typeGroup,
  type VolcanoStore,
} from "./volcanoes.js";

export interface QuakeLayer {
  showMech: Ref<boolean>;
  showDensity: Ref<boolean>;
  density: ComputedRef<ApiEventGrid | null>;
  densityLegend: ComputedRef<DensityLegend | null>;
  anim: Animation;
  /** What the map draws: everything, or only what has happened by the animation cursor. */
  shown: ComputedRef<ApiEvent[]>;
  countLine: ComputedRef<string>;
  openAnimation(): void;
  togglePlay(): void;
  onHover(payload: { e: ApiEvent; x: number; y: number }): void;
}

/** The earthquake half of a map: density, animation, count line, tips and zoom-to-selection. Call inside setup. */
export function useQuakeLayer(o: {
  catalog: Catalog;
  clock: Clock;
  zone: Readonly<Ref<Zone>>;
  mv: MapView;
}): QuakeLayer {
  const { catalog, clock, zone, mv } = o;
  const events = catalog.filtered;
  const showMech = ref(true);
  const showDensity = ref(false);
  const density = computed(() => {
    const s = catalog.stats.value;
    return catalog.raised.value && s !== null ? s.grid : null;
  });
  const densityLegend = computed(() =>
    density.value === null || !showDensity.value
      ? null
      : densityLegendFor(density.value, catalog.requested.value),
  );
  const anim = createAnimation();
  const windowBounds = computed(() => {
    const now = clock.now.value;
    const win = catalog.range.value;
    if (win !== null) {
      return {
        start: new Date(win.since),
        end: new Date(Math.min(Date.parse(win.until), now.getTime())),
      };
    }
    return { start: new Date(now.getTime() - catalog.requireRegion().days * DAY_MS), end: now };
  });
  const countLine = computed(() => {
    const base = `Showing ${String(events.value.length)} of ${fmtInt(catalog.windowTotal.value)} events`;
    return catalog.raised.value ? `${base} · markers at ${fmtFloor(catalog.floor.value)}` : base;
  });
  const shown = computed(() => {
    const c = anim.cursor.value;
    if (c === null) return events.value;
    const t = c.getTime();
    return events.value.filter((e) => Date.parse(e.time) <= t);
  });
  watch(catalog.selected, (e) => {
    if (e !== null) mv.zoomTo(e.longitude, e.latitude);
  });
  onUnmounted(() => {
    anim.close();
  });
  return {
    showMech,
    showDensity,
    density,
    densityLegend,
    anim,
    shown,
    countLine,
    openAnimation() {
      anim.open(windowBounds.value.start, windowBounds.value.end, zone.value);
    },
    togglePlay() {
      if (anim.playing.value) anim.pause();
      else anim.play();
    },
    onHover(payload) {
      const { e } = payload;
      const depth = e.depthKm === null ? "—" : String(Math.round(e.depthKm));
      const type = e.magType === null ? "" : ` ${e.magType}`;
      mv.showTip(
        `M${fmtMag(e.mag)}${type} · ${depth} km · ${placeOf(e)} · ${fmtShort(e.time, zone.value)}`,
        payload.x,
        payload.y,
      );
    },
  };
}

export interface VolcanoLayer {
  countLine: ComputedRef<string>;
  ringOf(number: number): string | null;
  onHover(payload: { v: Volcano; x: number; y: number }): void;
}

/** The volcano half of a map: count line, status rings, tips and zoom-to-selection. Call inside setup. */
export function useVolcanoLayer(o: { store: VolcanoStore; mv: MapView }): VolcanoLayer {
  const { store, mv } = o;
  const countLine = computed(
    () =>
      `Showing ${String(store.filtered.value.length)} of ${String(store.inRegion.value.length)} volcanoes`,
  );
  function topStatus(number: number) {
    const list = store.statusesOf.value.get(number) ?? [];
    return [...list].sort((a, b) => statusRank(b) - statusRank(a))[0] ?? null;
  }
  watch(store.selected, (v) => {
    if (v !== null) mv.zoomTo(v.lon, v.lat);
  });
  return {
    countLine,
    ringOf(number) {
      const top = topStatus(number);
      return top !== null && statusRank(top) > 0 ? aviationColor(top.color) : null;
    },
    onHover(payload) {
      const { v } = payload;
      const top = topStatus(v.number);
      const parts = [v.name, TYPE_GROUPS[typeGroup(v.type)], lastEruptionText(v)];
      if (top !== null && statusRank(top) > 0) parts.push(statusLabel(top));
      if (store.continuing.value.has(v.number)) parts.push("eruption continuing (GVP)");
      mv.showTip(parts.join(" · "), payload.x, payload.y - TIP_LIFT);
    },
  };
}
```

`AnimationBar.vue` (props `anim: Animation`, `shown: number`, `total: number`; injects `ZONE`) is the `<div class="animbar">` block from today's `QuakeMap`, with `anim.active.value && anim.cursor.value !== null` as its `v-if` and a `togglePlay` prop-less local function. `VolcanoLegendRows.vue` is the `#legend` content of today's `VolcanoMap`. Rewrite `QuakeMap.vue` and `VolcanoMap.vue` on these so their templates only wire slots; keep the existing tests green unchanged.

- [ ] **Step 3: Failing `CombinedMap` test**

```ts
it("draws volcanoes under earthquakes, joins both count lines, and hides either layer on request", async () => {
  stubWorld();
  stubCanvas();
  const ctx = await makeContext({ volcanoes: true });
  const w = mountWith(CombinedMap, ctx, { animate: false });
  await flushPromises();
  expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events · 5 of 5 volcanoes");
  const layers = w.find("svg.map > g").element.children;
  const names = Array.from(layers).map((c) => c.getAttribute("data-layer"));
  expect(names.indexOf("volcanoes")).toBeLessThan(names.indexOf("events"));
  ctx.volcanoes.hideMarkers.value = true;
  await nextTick();
  expect(w.findComponent({ name: "MapVolcanoes" }).exists()).toBe(false);
  expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events · 5 of 5 volcanoes");
  ctx.catalog.hideMarkers.value = true;
  await nextTick();
  expect(w.findComponent({ name: "MapEvents" }).exists()).toBe(false);
  expect(w.text()).toContain("Beachball: shaded = compressional");
  expect(w.text()).toContain("ring: agency alert above normal");
  w.unmount();
});
```

Give `MapVolcanoes`' and `MapEvents`' root `<g>` a `data-layer="volcanoes"` / `data-layer="events"` attribute so order is testable. Also test the tips (hover a `g.volc` and a `circle`) and the Animate button filtering `shown`.

- [ ] **Step 4: Implement `CombinedMap.vue` and `ActiveEarthPage.vue`**

```vue
<!-- CombinedMap.vue -->
<script setup lang="ts">
import { computed } from "vue";
import AnimationBar from "./AnimationBar.vue";
import MapDensity from "./MapDensity.vue";
import MapEvents from "./MapEvents.vue";
import MapShell from "./MapShell.vue";
import MapVolcanoes from "./MapVolcanoes.vue";
import VolcanoLegendRows from "./VolcanoLegendRows.vue";
import {
  API,
  CATALOG,
  CLOCK,
  SELECT,
  SELECT_VOLCANO,
  useInjected,
  VOLCANOES,
  ZONE,
} from "../lib/keys.js";
import { useQuakeLayer, useVolcanoLayer } from "../lib/layers.js";
import { useMapView } from "../lib/mapview.js";

const props = withDefaults(defineProps<{ animate?: boolean }>(), { animate: true });
const api = useInjected(API);
const catalog = useInjected(CATALOG);
const store = useInjected(VOLCANOES);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const select = useInjected(SELECT);
const selectVolcano = useInjected(SELECT_VOLCANO);
const mv = useMapView({ api, region: () => catalog.requireRegion(), animate: () => props.animate });
const q = useQuakeLayer({ catalog, clock, zone, mv });
const v = useVolcanoLayer({ store, mv });
const countLine = computed(
  () => `${q.countLine.value} · ${v.countLine.value.replace(/^Showing /, "")}`,
);
</script>

<template>
  <MapShell
    :mv="mv"
    label="Map of earthquake epicenters and Holocene volcanoes"
    :count-line="countLine"
    :density="q.densityLegend.value"
    :floor="catalog.floor.value"
  >
    <template #tools>
      <label v-if="q.density.value !== null"
        ><input v-model="q.showDensity.value" type="checkbox" /> Density</label
      >
      <label><input v-model="q.showMech.value" type="checkbox" /> Focal mechanisms</label>
    </template>
    <template #actions>
      <button
        type="button"
        class="zbtn"
        style="width: auto; padding: 0 8px"
        :aria-pressed="q.anim.active.value"
        title="Replay the loaded window on the map, step by step"
        @click="q.anim.active.value ? q.anim.close() : q.openAnimation()"
      >
        Animate
      </button>
    </template>
    <template #bar
      ><AnimationBar
        :anim="q.anim"
        :shown="q.shown.value.length"
        :total="catalog.filtered.value.length"
    /></template>
    <template #layers="{ frame, k, minRadius }">
      <MapDensity
        v-if="q.density.value !== null && q.showDensity.value"
        :path="mv.view.value.path"
        :grid="q.density.value"
      />
      <MapVolcanoes
        v-if="!store.hideMarkers.value"
        :frame="frame"
        :volcanoes="store.filtered.value"
        :k="k"
        :selected="store.selectedNumber.value"
        :ring-of="v.ringOf"
        :continuing="store.continuing.value"
        :min-radius="minRadius"
        @select="selectVolcano"
        @hover="v.onHover"
        @leave="mv.clearTip()"
      />
      <MapEvents
        v-if="!catalog.hideMarkers.value"
        :frame="frame"
        :events="q.shown.value"
        :k="k"
        :selected-id="catalog.selectedId.value"
        :show-mech="q.showMech.value"
        :min-mag="catalog.floor.value"
        :min-radius="minRadius"
        @select="select"
        @hover="q.onHover"
        @leave="mv.clearTip()"
      />
    </template>
    <template #legend><VolcanoLegendRows /></template>
  </MapShell>
</template>
```

`ActiveEarthPage.vue`:

```vue
<script setup lang="ts">
import CatalogTable from "./CatalogTable.vue";
import CombinedMap from "./CombinedMap.vue";
import DepthChart from "./DepthChart.vue";
import EruptionDecadeChart from "./EruptionDecadeChart.vue";
import FilterBar from "./FilterBar.vue";
import FrequencyMagnitudeChart from "./FrequencyMagnitudeChart.vue";
import MagnitudeTimeChart from "./MagnitudeTimeChart.vue";
import MajorEvents from "./MajorEvents.vue";
import StatsStrip from "./StatsStrip.vue";
import VeiChart from "./VeiChart.vue";
import VolcanoCards from "./VolcanoCards.vue";
import VolcanoFilterBar from "./VolcanoFilterBar.vue";
import VolcanoTable from "./VolcanoTable.vue";
import VolcanoTiles from "./VolcanoTiles.vue";
import { SETTINGS, useInjected, VOLCANOES } from "../lib/keys.js";

const store = useInjected(VOLCANOES);
const settings = useInjected(SETTINGS);
</script>

<template>
  <div v-if="store.error.value !== null" class="banner error" role="alert">
    <span>{{ store.error.value }}</span>
    <button type="button" @click="store.load()">Retry</button>
  </div>
  <StatsStrip />
  <VolcanoTiles />
  <MajorEvents :rows="settings.current.value.cardRows.combined" />
  <VolcanoCards :rows="settings.current.value.cardRows.combined" />
  <FilterBar />
  <VolcanoFilterBar />
  <CombinedMap />
  <p class="sectionlabel">Earthquakes</p>
  <section class="grid2">
    <CatalogTable />
    <div class="charts"><MagnitudeTimeChart /><FrequencyMagnitudeChart /><DepthChart /></div>
  </section>
  <p class="sectionlabel">Volcanoes</p>
  <section class="grid2">
    <VolcanoTable />
    <div class="charts"><EruptionDecadeChart /><VeiChart /></div>
  </section>
</template>
```

`ActiveEarthPage.test.ts` asserts the order of `.stats`, `.major`, `.filters.refine.earthquakes`, `.filters.refine.volcanoes`, `.mapcard`, the two `.sectionlabel` chapter labels and two `.grid2`, plus the error banner retry. `App.test.ts` adds: `/active/wc?event=us1` boots both stores, shows `Active Earth` current, the count line carries both numbers, clicking a volcano row removes `event` from the query and adds `volcano`, the feed change refreshes volcano live state on this page too.

- [ ] **Step 5: Docs**

README Front end bullets: the Active Earth page and its layout; refine bars' two states and `Hide markers`; card rows and the `tectonic.settings` key with its defaults; eruption-relative offsets. CLAUDE.md Front end: `Page` includes `active` and `hasVolcanoes`; `SETTINGS`; `RefineBar`/`refine.ts`; `CardGrid`; `layers.ts` composables shared by the three maps; `hideMarkers` on both stores.

- [ ] **Step 6: Full gate, Chrome pass on `/active/wc` and `/active`, commit** `feat(web): Active Earth page with both datasets on one map`

---

## Self-review

- Spec §1 → Task 1; §2 → Task 2; §3 → Task 3; §4 and §5 → Task 4; §6 tests are spread across the tasks' steps; §7 → Task 4 step 5.
- Names used across tasks: `SettingsStore.current` (Tasks 2 and 4), `hideMarkers` (Tasks 3 and 4), `hasVolcanoes` (Task 4 only), `quakeParts`/`volcanoParts` (Task 3), `offsetText`/`eruptionAnchor` (Task 1).
- One spec wording change made while planning: the toggle is a small `edit`/`done` button after the summary rather than the whole title being the button, so the hide checkbox is not nested in a button.
