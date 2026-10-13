import { mount, type VueWrapper } from "@vue/test-utils";
import { vi, type Mock } from "vitest";
import { defineComponent, h, provide, type Component } from "vue";
import type { ApiClient } from "../../src/lib/api.js";
import { createCatalog, type Catalog } from "../../src/lib/catalog.js";
import { createClock, type Clock } from "../../src/lib/clock.js";
import type { EventFilter } from "../../src/lib/filters.js";
import { API, CATALOG, CLOCK, SELECT, SET_FILTER, STATUS, THEME } from "../../src/lib/keys.js";
import { createStatusPoll, type StatusPoll } from "../../src/lib/status.js";
import { createTheme, type Theme } from "../../src/lib/theme.js";
import { fakeApi } from "./api.js";

export interface Context {
  api: ApiClient;
  catalog: Catalog;
  status: StatusPoll;
  clock: Clock;
  theme: Theme;
  select: Mock<(id: string | null) => void>;
  setFilter: Mock<(f: EventFilter) => void>;
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

/** A loaded catalog and polled status over a fake API, never ticking. */
export async function makeContext(
  over: { api?: ApiClient; now?: Date; regionId?: string } = {},
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
  return {
    api,
    catalog,
    status,
    clock,
    theme: fakeTheme(),
    select: vi.fn(),
    setFilter: vi.fn(),
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
      return () => h(component, props);
    },
  });
  return mount(Parent, { attachTo: document.body });
}
