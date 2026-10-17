import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, onMounted, provide } from "vue";
import { createMemoryHistory, RouterView } from "vue-router";
import type { ApiClient } from "../../src/lib/api.js";
import { createClock } from "../../src/lib/clock.js";
import { API, CLOCK, SELECT, SETTINGS, THEME, useInjected } from "../../src/lib/keys.js";
import { createSettings } from "../../src/lib/settings.js";
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
      provide(SETTINGS, createSettings(null));
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
    expect(wrapper.find("footer").text()).toContain("Quaternary Fault and Fold Database");
    expect(wrapper.find("footer .byline").text()).toBe("Built for Barbara by Tillman");
    expect(wrapper.find("footer .byline a").attributes("href")).toBe(
      "https://github.com/tillmanjr",
    );
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
    expect(api.events).toHaveBeenCalledTimes(4);
    expect(vi.mocked(api.events).mock.calls.at(-1)?.[0]).toMatchObject({
      since: "2026-09-13T00:00:00.000Z",
      until: "2026-10-13T23:59:59.999Z",
    });
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
    await wrapper.find(".filters .rtoggle").trigger("click");
    const inputs = wrapper.findAll<HTMLInputElement>(".filters input");
    expect(inputs[0]?.element.value).toBe("4.5");
    expect(inputs[3]?.element.value).toBe("200");
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events");
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
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events");
    await wrapper.find(".filters .rhide input").setValue(true);
    expect(wrapper.findComponent({ name: "MapEvents" }).exists()).toBe(false);
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events");
    expect(wrapper.findAll("tr.ev")).toHaveLength(1);
  });

  it("switches every time to the browser zone and loads a date range", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp("/?since=2026-10-01&until=2026-10-05");
    await flushPromises();
    expect(vi.mocked(api.events).mock.calls.at(-1)?.[0]).toMatchObject({
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-05T23:59:59.999Z",
    });
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events");
    expect(wrapper.find("th").text()).toBe("Time (UTC)");
    await wrapper.find("button[title^='Show every date']").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.tz).toBe("local");
    expect(wrapper.find("th").text()).toBe("Time (local)");
    await wrapper.find(".filters .rtoggle").trigger("click");
    expect(wrapper.find(".filters").text()).toContain("Window (local)");
    await wrapper.find("button[title^='Show every date']").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.tz).toBeUndefined();
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
    expect(api.events).toHaveBeenCalledTimes(4);
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

  it("serves the volcano page from its route with region, selection and filter, and switches pages", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp(
      "/volcanoes/wc?volcano=321050&age=recent&tz=local",
    );
    await flushPromises();
    const current = wrapper.find(".pages button[aria-current='page']");
    expect(current.text()).toBe("Volcanoes");
    expect(wrapper.find(".stats").text()).toContain("USGS elevated");
    expect(api.geo).toHaveBeenCalledWith("volcanoes");
    expect(wrapper.find(".vdetail").classes()).toContain("open");
    expect(wrapper.find(".vdetail .mag").text()).toBe("St. Helens");
    expect(wrapper.findAll("tr.ev")).toHaveLength(1);
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 2 volcanoes");
    await wrapper.find(".vdetail .close").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.volcano).toBeUndefined();
    await wrapper.find(".filters .rtoggle").trigger("click");
    await wrapper.findAll(".filters select")[2]?.setValue("");
    await flushPromises();
    expect(router.currentRoute.value.query.age).toBeUndefined();
    expect(wrapper.findAll("tr.ev")).toHaveLength(2);
    await wrapper.findAll("tr.ev")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.volcano).toBe("323010");
    await wrapper.findAll("[role=tab]")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/volcanoes");
    expect(router.currentRoute.value.query).toEqual({ tz: "local" });
    expect(wrapper.find(".mapcount").text()).toBe("Showing 5 of 5 volcanoes");
    const before = vi.mocked(api.volcanoStatus).mock.calls.length;
    await wrapper.findAll(".pages button")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/");
    expect(wrapper.find(".pages button[aria-current='page']").text()).toBe("Earthquakes");
    expect(wrapper.find(".filters .rsummary").text()).toContain("M4.5+");
    await wrapper.findAll(".pages button")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/");
    await wrapper.findAll(".pages button")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/volcanoes");
    expect(vi.mocked(api.volcanoStatus).mock.calls.length).toBe(before + 1);
    expect(vi.mocked(api.geo).mock.calls.filter((c) => c[0] === "volcanoes")).toHaveLength(1);
  });

  it("serves Active Earth with both datasets and keeps one selection at a time", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp("/active/wc?volcano=321050");
    await flushPromises();
    expect(wrapper.find(".pages button[aria-current='page']").text()).toBe("Active Earth");
    expect(api.geo).toHaveBeenCalledWith("volcanoes");
    expect(wrapper.findAll(".stats")).toHaveLength(2);
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events · 2 of 2 volcanoes");
    expect(wrapper.find(".vdetail").classes()).toContain("open");
    await wrapper.find(".grid2 tr.ev").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ event: "us1" });
    expect(wrapper.find(".vdetail").classes()).not.toContain("open");
    expect(wrapper.find(".detail").classes()).toContain("open");
    await wrapper.findAll(".grid2")[1]?.find("tr.ev").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ volcano: "323010" });
    expect(wrapper.find(".detail").classes()).not.toContain("open");
    expect(wrapper.find(".vdetail").classes()).toContain("open");
    await wrapper.findAll(".pages button")[0]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/wc");
    expect(wrapper.find(".vdetail").exists()).toBe(false);
    await wrapper.findAll(".pages button")[2]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/active/wc");
  });

  it("refreshes the volcano live state on a feed change while on the volcano page", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    stubCanvas();
    const api = fakeApi();
    vi.mocked(api.status)
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T12:05:00.000Z" }));
    const { wrapper } = await mountApp("/volcanoes", api);
    await flushPromises();
    const before = vi.mocked(api.volcanoStatus).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(vi.mocked(api.volcanoStatus).mock.calls.length).toBe(before + 1);
    wrapper.unmount();
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
