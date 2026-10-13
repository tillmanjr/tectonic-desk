import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, onMounted, provide } from "vue";
import { createMemoryHistory, RouterView } from "vue-router";
import type { ApiClient } from "../../src/lib/api.js";
import { createClock } from "../../src/lib/clock.js";
import { API, CLOCK, SELECT, THEME, useInjected } from "../../src/lib/keys.js";
import { createAppRouter } from "../../src/router.js";
import { fakeApi, status } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, GLOBAL, WC } from "../support/events.js";
import { fakeTheme, NOW } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

async function mountApp(path = "/", api: ApiClient = fakeApi()) {
  stubWorld();
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  const theme = fakeTheme();
  const Root = defineComponent({
    setup() {
      provide(API, api);
      provide(
        CLOCK,
        createClock(1e9, () => NOW),
      );
      provide(THEME, theme);
      return () => h(RouterView);
    },
  });
  const wrapper = mount(Root, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router, api, theme };
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("boots into the routed region and selection", async () => {
    stubCanvas();
    const { wrapper, router } = await mountApp("/wc?event=us1");
    expect(wrapper.find("[role=tab][aria-selected=true]").text()).toContain("West Coast");
    expect(wrapper.find(".sectionlabel").text()).toBe("Largest events in the region");
    expect(wrapper.find(".detail").classes()).toContain("open");
    expect(wrapper.find(".detail .mag").text()).toContain("M5.5");
    await router.replace({ query: {} });
    await flushPromises();
    expect(wrapper.find(".detail").classes()).not.toContain("open");
  });

  it("redirects an unknown region to global", async () => {
    const { wrapper, router } = await mountApp("/mars");
    expect(router.currentRoute.value.path).toBe("/");
    expect(wrapper.find("[role=tab][aria-selected=true]").text()).toContain("Global");
  });

  it("switches region from the tabs and writes the selection to the query", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp("/");
    await wrapper.findAll("[role=tab]")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/wc");
    expect(api.events).toHaveBeenCalledTimes(2);
    await wrapper.find("tr.ev").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.event).toBe("us1");
    expect(wrapper.find("tr.ev").classes()).toContain("sel");
    await wrapper.find(".detail .close").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.event).toBeUndefined();
    await wrapper.findAll("[role=tab]")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/");
    expect(router.currentRoute.value.query.event).toBeUndefined();
  });

  it("shows the error banner and retries regions, then events", async () => {
    const api = fakeApi({
      regions: vi
        .fn()
        .mockRejectedValueOnce(new Error("no regions"))
        .mockResolvedValue([GLOBAL, WC]),
    });
    const { wrapper } = await mountApp("/", api);
    expect(wrapper.find(".banner.error").text()).toContain("no regions");
    await wrapper.find(".banner.error button").trigger("click");
    await flushPromises();
    expect(wrapper.find(".banner.error").exists()).toBe(false);
    vi.mocked(api.events).mockRejectedValueOnce(new Error("events down"));
    await wrapper.findAll("[role=tab]")[1]?.trigger("click");
    await flushPromises();
    expect(wrapper.find(".banner.error").text()).toContain("events down");
    await wrapper.find(".banner.error button").trigger("click");
    await flushPromises();
    expect(wrapper.find(".banner.error").exists()).toBe(false);
  });

  it("round-trips the filters through the URL and keeps them across a region switch", async () => {
    stubCanvas();
    const { wrapper, router } = await mountApp("/?minMag=3&maxDepth=200");
    const inputs = wrapper.findAll<HTMLInputElement>(".filters input");
    expect(inputs[0]?.element.value).toBe("4.5");
    expect(inputs[3]?.element.value).toBe("200");
    expect(wrapper.find(".filters").text()).toContain("Showing 1 of 1 events");
    await inputs[1]?.setValue("7");
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({
      minMag: "4.5",
      maxMag: "7",
      maxDepth: "200",
    });
    await wrapper.findAll("[role=tab]")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/wc");
    expect(router.currentRoute.value.query.maxDepth).toBe("200");
    await wrapper.find(".filters .fclear").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.find(".filters").text()).toContain("All 1 events shown");
  });

  it("shows the truncation banner", async () => {
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue({ events: [event()], count: 1, truncated: true, query: {} }),
    });
    const { wrapper } = await mountApp("/", api);
    expect(wrapper.find(".banner").text()).toContain("newest 2000 events");
  });

  it("refetches events when the feed time changes, clears the beachball cache on theme change, stops on unmount", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const api = fakeApi();
    vi.mocked(api.status)
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T12:05:00.000Z" }));
    const { wrapper, theme } = await mountApp("/", api);
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(api.events).toHaveBeenCalledTimes(2);
    theme.set("dark");
    await flushPromises();
    expect(theme.resolved.value).toBe("dark");
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it("removes the event from the query when a child deselects", async () => {
    const Probe = defineComponent({
      setup() {
        const select = useInjected(SELECT);
        onMounted(() => {
          select("us1");
          select(null);
        });
        return () => null;
      },
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/?event=us1");
    const Root = defineComponent({
      setup() {
        provide(API, fakeApi());
        provide(
          CLOCK,
          createClock(1e9, () => NOW),
        );
        provide(THEME, fakeTheme());
        return () => h(RouterView);
      },
    });
    stubWorld();
    mount(Root, { global: { plugins: [router], stubs: { StatusLine: Probe } } });
    await flushPromises();
    expect(router.currentRoute.value.query.event).toBeUndefined();
  });

  it("falls back to a real api client, clock and theme when none are provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.find(".banner.error").text()).toContain("offline");
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
