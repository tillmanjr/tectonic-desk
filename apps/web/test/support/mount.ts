import { mount, type VueWrapper } from "@vue/test-utils";
import { vi, type Mock } from "vitest";
import { defineComponent, h, provide, ref, type Component, type Ref } from "vue";
import type { ApiClient } from "../../src/lib/api.js";
import { createCatalog, type Catalog } from "../../src/lib/catalog.js";
import { createClock, type Clock } from "../../src/lib/clock.js";
import type { EventFilter } from "../../src/lib/filters.js";
import type { Zone } from "../../src/lib/format.js";
import {
  API,
  CATALOG,
  CLOCK,
  SELECT,
  SELECT_VOLCANO,
  SET_FILTER,
  SET_VOLCANO_FILTER,
  STATUS,
  THEME,
  VOLCANOES,
  ZONE,
} from "../../src/lib/keys.js";
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

/** A loaded catalog and polled status over a fake API, never ticking; `volcanoes: true` also loads the volcano store. */
export async function makeContext(
  over: { api?: ApiClient; now?: Date; regionId?: string; volcanoes?: boolean } = {},
): Promise<Context> {
  const api = over.api ?? fakeApi();
  const now = over.now ?? NOW;
  const clock = createClock(1e9, () => now);
  const catalog = createCatalog(api, () => now);
  await catalog.init();
  await catalog.setRegion(over.regionId ?? "global");
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
      provide(ZONE, ctx.zone);
      return () => h(component, props);
    },
  });
  return mount(Parent, { attachTo: document.body });
}
