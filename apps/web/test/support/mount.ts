import { mount, type VueWrapper } from "@vue/test-utils";
import { vi, type Mock } from "vitest";
import { defineComponent, h, provide, ref, type Component, type Ref } from "vue";
import type { ApiClient } from "../../src/lib/api.js";
import { createAuroraStore, type AuroraStore } from "../../src/lib/aurora.js";
import { createCatalog, type Catalog } from "../../src/lib/catalog.js";
import { createClock, type Clock } from "../../src/lib/clock.js";
import type { EventFilter, Range } from "../../src/lib/filters.js";
import type { Zone } from "../../src/lib/format.js";
import {
  API,
  AURORA,
  CATALOG,
  CLOCK,
  MARKS,
  MARKS_NAV,
  NOTICE,
  SECTION,
  SELECT,
  SELECT_VOLCANO,
  SET_FILTER,
  SET_SECTION,
  SET_VOLCANO_FILTER,
  SET_SPACE_RANGE,
  SETTINGS,
  SPACE,
  STATUS,
  THEME,
  VOLCANOES,
  ZONE,
  type MarksMode,
  type MarksNav,
} from "../../src/lib/keys.js";
import { createMarks, type MarksStore } from "../../src/lib/marks.js";
import { createNotice, type NoticeStore } from "../../src/lib/notice.js";
import type { Section } from "../../src/lib/section.js";
import { createSettings, type SettingsStore } from "../../src/lib/settings.js";
import { createSpaceStore, type SpaceRange, type SpaceStore } from "../../src/lib/space.js";
import { createStatusPoll, type StatusPoll } from "../../src/lib/status.js";
import { createTheme, type Theme } from "../../src/lib/theme.js";
import {
  createVolcanoStore,
  type VolcanoFilter,
  type VolcanoStore,
} from "../../src/lib/volcanoes.js";
import { fakeApi } from "./api.js";

export interface Context {
  api: ApiClient;
  catalog: Catalog;
  status: StatusPoll;
  clock: Clock;
  theme: Theme;
  select: Mock<(id: string | null) => void>;
  setFilter: Mock<(f: EventFilter) => void>;
  volcanoes: VolcanoStore;
  selectVolcano: Mock<(number: number | null) => void>;
  setVolcanoFilter: Mock<(f: VolcanoFilter) => void>;
  settings: SettingsStore;
  marks: MarksStore;
  notice: NoticeStore;
  section: Ref<Section | null>;
  setSection: Mock<(s: Section | null) => void>;
  space: SpaceStore;
  aurora: AuroraStore;
  setSpaceRange: Mock<(r: SpaceRange) => void>;
  /** Spies for every nav action; `overlay` is the writable ref behind `nav.overlay`. */
  nav: MarksNav;
  overlay: Ref<{ group: string; mode: MarksMode } | null>;
  zone: Ref<Zone>;
  now: Date;
}

export const NOW = new Date("2026-10-13T12:00:00Z");

const noDoc = {
  hidden: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

export function fakeTheme(): Theme {
  return createTheme({
    storage: null,
    media: { matches: false, addEventListener: () => undefined },
    root: document.createElement("div"),
  });
}

/**
 * A loaded catalog and polled status over a fake API, never ticking;
 * `volcanoes: true` also loads the volcano store, `range` loads that window.
 */
export async function makeContext(
  over: {
    api?: ApiClient;
    now?: Date;
    regionId?: string;
    volcanoes?: boolean;
    range?: Range;
    /** Also load the space weather store. */
    space?: boolean;
  } = {},
): Promise<Context> {
  const api = over.api ?? fakeApi();
  const now = over.now ?? NOW;
  const clock = createClock(1e9, () => now);
  const catalog = createCatalog(api, () => now);
  await catalog.init();
  await catalog.setRegion(over.regionId ?? "global");
  if (over.range !== undefined) {
    catalog.setRange(over.range);
    await new Promise((r) => setTimeout(r, 0));
  }
  const status = createStatusPoll(
    api,
    () => now,
    () => undefined,
    { intervalMs: 1e9, doc: noDoc },
  );
  await status.poll();
  const volcanoes = createVolcanoStore(api, () => now);
  volcanoes.setRegion(catalog.region.value);
  if (over.volcanoes === true) await volcanoes.load();
  const space = createSpaceStore(api, () => now, { intervalMs: 1e9, doc: noDoc });
  const aurora = createAuroraStore(api, { intervalMs: 1e9, doc: noDoc });
  if (over.space === true) {
    await space.load();
    await aurora.load();
  }
  const overlay = ref<{ group: string; mode: MarksMode } | null>(null);
  return {
    api,
    catalog,
    status,
    clock,
    theme: fakeTheme(),
    select: vi.fn(),
    setFilter: vi.fn(),
    volcanoes,
    selectVolcano: vi.fn(),
    setVolcanoFilter: vi.fn(),
    settings: createSettings(null),
    marks: createMarks(null),
    notice: createNotice(),
    section: ref<Section | null>(null),
    setSection: vi.fn(),
    space,
    aurora,
    setSpaceRange: vi.fn(),
    nav: {
      viewUrl: ref("/wc?event=us1"),
      overlay,
      open: vi.fn(),
      show: vi.fn(),
      compare: vi.fn(),
      list: vi.fn(),
      close: vi.fn(),
      goTo: vi.fn(),
      openHere: vi.fn(),
    },
    overlay,
    zone: ref<Zone>("utc"),
    now,
  };
}

/** Mounts `component` under a parent that provides the context. */
export function mountWith(
  component: Component,
  ctx: Context,
  props: Record<string, unknown> = {},
): VueWrapper {
  const Parent = defineComponent({
    setup() {
      provide(API, ctx.api);
      provide(CATALOG, ctx.catalog);
      provide(STATUS, ctx.status);
      provide(CLOCK, ctx.clock);
      provide(THEME, ctx.theme);
      provide(SELECT, ctx.select);
      provide(SET_FILTER, ctx.setFilter);
      provide(VOLCANOES, ctx.volcanoes);
      provide(SELECT_VOLCANO, ctx.selectVolcano);
      provide(SET_VOLCANO_FILTER, ctx.setVolcanoFilter);
      provide(SETTINGS, ctx.settings);
      provide(MARKS, ctx.marks);
      provide(MARKS_NAV, ctx.nav);
      provide(NOTICE, ctx.notice);
      provide(SECTION, ctx.section);
      provide(SET_SECTION, ctx.setSection);
      provide(SPACE, ctx.space);
      provide(AURORA, ctx.aurora);
      provide(SET_SPACE_RANGE, ctx.setSpaceRange);
      provide(ZONE, ctx.zone);
      return () => h(component, props);
    },
  });
  return mount(Parent, { attachTo: document.body });
}
