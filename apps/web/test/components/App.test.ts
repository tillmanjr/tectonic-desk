import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, onMounted, provide } from "vue";
import { createMemoryHistory, RouterView } from "vue-router";
import type { ApiClient } from "../../src/lib/api.js";
import { createClock } from "../../src/lib/clock.js";
import {
  API,
  CLOCK,
  MARKS,
  SECTION,
  SELECT,
  SET_SECTION,
  SETTINGS,
  THEME,
  useInjected,
} from "../../src/lib/keys.js";
import { createMarks } from "../../src/lib/marks.js";
import type { Section } from "../../src/lib/section.js";
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
  const marks = createMarks(null);
  const Root = defineComponent({
    setup() {
      provide(API, api);
      provide(MARKS, marks);
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
  return { wrapper, router, api, theme, marks };
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("boots into the routed region and selection", async () => {
    stubCanvas();
    const { wrapper, router } = await mountApp("/earthquakes/wc?event=us1");
    expect(wrapper.find("[role=tab][aria-selected=true]").text()).toContain("West Coast");
    expect(wrapper.find(".sectionlabel").text()).toBe("Largest events in the region");
    expect(wrapper.find("footer").text()).toContain("Quaternary Fault and Fold Database");
    expect(wrapper.find("footer .byline").text()).toBe("Built for Barbara by Tillman");
    expect(wrapper.find("footer .byline a").attributes("href")).toBe(
      "https://github.com/tillmanjr",
    );
    expect(wrapper.find("footer .byline a").attributes("target")).toBe("_blank");
    expect(wrapper.find("footer .byline a").attributes("rel")).toBe("author noopener");
    expect(wrapper.find(".detail").classes()).toContain("open");
    expect(wrapper.find(".detail .mag").text()).toContain("M5.5");
    await router.replace({ query: {} });
    await flushPromises();
    expect(wrapper.find(".detail").classes()).not.toContain("open");
  });

  it("redirects an unknown region to global", async () => {
    const { wrapper, router } = await mountApp("/mars");
    expect(router.currentRoute.value.path).toBe("/earthquakes");
    expect(wrapper.find("[role=tab][aria-selected=true]").text()).toContain("Global");
  });

  it("switches region from the tabs and writes the selection to the query", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp("/earthquakes");
    await wrapper.findAll("[role=tab]")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/earthquakes/wc");
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
    expect(router.currentRoute.value.path).toBe("/earthquakes");
    expect(router.currentRoute.value.query.event).toBeUndefined();
  });

  it("shows the error banner and retries regions, then events", async () => {
    const api = fakeApi({
      regions: vi
        .fn()
        .mockRejectedValueOnce(new Error("no regions"))
        .mockResolvedValue([GLOBAL, WC]),
    });
    const { wrapper } = await mountApp("/earthquakes", api);
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
    const { wrapper, router } = await mountApp("/earthquakes?minMag=3&maxDepth=200");
    await wrapper.find(".filters .rhead").trigger("click");
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
    expect(router.currentRoute.value.path).toBe("/earthquakes/wc");
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
    const { wrapper, router, api } = await mountApp(
      "/earthquakes?since=2026-10-01&until=2026-10-05",
    );
    await flushPromises();
    expect(vi.mocked(api.events).mock.calls.at(-1)?.[0]).toMatchObject({
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-05T23:59:59.999Z",
    });
    expect(wrapper.find(".mapcount").text()).toBe("Showing 1 of 1 events");
    expect(wrapper.find("th").text()).toBe("Time (UTC)");
    expect(wrapper.find("button[title^='Show every date']").exists()).toBe(false);
    await wrapper.find(".settings-btn").trigger("click");
    await wrapper.find("button[title^='Show every date']").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.tz).toBe("local");
    expect(wrapper.find("th").text()).toBe("Time (local)");
    await wrapper.find(".filters .rhead").trigger("click");
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
    const { wrapper } = await mountApp("/earthquakes", api);
    expect(wrapper.find(".banner").text()).toContain("newest 2000 events");
  });

  it("refetches events when the feed time changes, clears the beachball cache on theme change, stops on unmount", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const api = fakeApi();
    vi.mocked(api.status)
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T12:05:00.000Z" }));
    const { wrapper, theme } = await mountApp("/earthquakes", api);
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
    await router.push("/earthquakes?event=us1");
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
    await wrapper.find(".filters .rhead").trigger("click");
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
    // page pills: Active Earth, Earthquakes, Volcanoes
    await wrapper.findAll(".pages button")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/earthquakes");
    expect(wrapper.find(".pages button[aria-current='page']").text()).toBe("Earthquakes");
    expect(wrapper.find(".filters .rsummary").text()).toContain("M4.5+");
    await wrapper.findAll(".pages button")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/earthquakes");
    await wrapper.findAll(".pages button")[2]?.trigger("click");
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
    await wrapper.findAll(".pages button")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/earthquakes/wc");
    expect(wrapper.find(".vdetail").exists()).toBe(false);
    await wrapper.findAll(".pages button")[0]?.trigger("click");
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

  it("saves the view without overlay keys and opens the marks overlay from the header", async () => {
    stubCanvas();
    const { wrapper, router, marks } = await mountApp("/earthquakes/wc?event=us1&marks=all");
    expect(wrapper.find(".marks-btn").text()).toBe("Marks");
    await wrapper.find(".detail .markrow button.mark").trigger("click");
    await wrapper.find(".detail .markrow input").trigger("keydown", { key: "Enter" });
    expect(marks.marks.value[0]?.url).toBe("/earthquakes/wc?event=us1");
    expect(wrapper.find(".marks-btn").text()).toBe("Marks · 1");
    await router.replace("/earthquakes/wc?event=us1");
    await flushPromises();
    await wrapper.find(".marks-btn").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ event: "us1", marks: "all" });
    expect(wrapper.find(".marks[role=dialog]").exists()).toBe(true);
    await wrapper.find(".showevents").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.show).toBe("panels");
    expect(wrapper.findAll("article.markcard")).toHaveLength(1);
    await wrapper.find(".backtolist").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.show).toBeUndefined();
    const first = marks.marks.value[0];
    if (first === undefined) throw new Error("no mark");
    marks.add({ ...first, name: "second", lon: first.lon + 1 });
    await flushPromises();
    await wrapper.find(".compare").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.show).toBe("matrix");
    expect(wrapper.findAll(".matrix tbody td.edge")).toHaveLength(1);
    await wrapper.find(".marks-close").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ event: "us1" });
    expect(wrapper.find(".marks").exists()).toBe(false);
    await router.replace("/volcanoes?marks=all");
    await flushPromises();
    await wrapper.find(".marks-rail button").trigger("click");
    await wrapper.find(".openview").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/earthquakes/wc?event=us1");
    expect(wrapper.find(".marks").exists()).toBe(false);
    wrapper.unmount();
  });

  it("lands on Active Earth and redirects old region-only links to the earthquakes page", async () => {
    stubCanvas();
    const { wrapper, router } = await mountApp("/");
    expect(router.currentRoute.value.path).toBe("/active");
    expect(
      wrapper
        .find(".tools nav.pages")
        .findAll("button")
        .map((b) => b.text()),
    ).toEqual(["Active Earth", "Earthquakes", "Volcanoes", "Space"]);
    expect(wrapper.find(".pages button[aria-current=page]").text()).toBe("Active Earth");
    expect(wrapper.find(".topbar header").exists()).toBe(true);
    expect(wrapper.find(".topbar .status").exists()).toBe(true);
    await router.push("/wc?event=us1&tz=local");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/earthquakes/wc?event=us1&tz=local");
    wrapper.unmount();
  });

  it("serves the Space page without region tabs, polls its store, and writes the range to the route", async () => {
    stubCanvas();
    const { wrapper, router, api } = await mountApp("/space?window=7d");
    expect(wrapper.find(".pages button[aria-current=page]").text()).toBe("Space");
    // the region tabs stay in the layout, hidden, so the page switch keeps its place
    const ghost = wrapper.find("[role=tablist]");
    expect(ghost.classes()).toContain("ghost");
    expect(ghost.attributes("aria-hidden")).toBe("true");
    expect(wrapper.find(".topbar .status").text()).toContain("NOAA SWPC");
    expect(wrapper.findAll(".stats.space .stat")).toHaveLength(6);
    expect(api.auroraIndex).toHaveBeenCalled();
    expect(wrapper.findAll(".aurora svg.polar")).toHaveLength(2);
    expect(wrapper.find(".sectionlabel").text()).toBe("Alerts · SWPC messages");
    expect(api.spaceWindow).toHaveBeenLastCalledWith(
      "2026-10-06T12:00:00.000Z",
      "2026-10-13T12:00:00.000Z",
    );
    const select = wrapper.find(".spacebar select");
    await select.setValue("6h");
    await flushPromises();
    expect(router.currentRoute.value.query.window).toBe("6h");
    expect(api.spaceWindow).toHaveBeenLastCalledWith(
      "2026-10-13T06:00:00.000Z",
      "2026-10-13T12:00:00.000Z",
    );
    await router.push("/space?from=2026-10-01T00:00Z&to=2026-10-01T06:00Z");
    await flushPromises();
    expect(api.spaceWindow).toHaveBeenLastCalledWith(
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T06:00:00.000Z",
    );
    const calls = vi.mocked(api.spaceWindow).mock.calls.length;
    await wrapper.findAll(".pages button")[1]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/earthquakes");
    expect(wrapper.find("[role=tablist]").classes()).not.toContain("ghost");
    expect(wrapper.find("[role=tablist]").attributes("aria-hidden")).toBeUndefined();
    await wrapper.findAll(".pages button")[3]?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/space");
    expect(vi.mocked(api.spaceWindow).mock.calls.length).toBeGreaterThan(calls);
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

    await router.push("/earthquakes/wc?volcano=1&tz=local&tz=utc&bare&marks=all");
    await flushPromises();
    await wrapper.find(".openhere").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/earthquakes/wc?tz=local&event=us1");
    expect(wrapper.find(".notice").exists()).toBe(false);
    wrapper.unmount();
  });

  it("parses the section from the route and writes it back through SET_SECTION", async () => {
    stubCanvas();
    const seen: unknown[] = [];
    const setter: { fn: ((s: Section | null) => void) | null } = { fn: null };
    const Probe = defineComponent({
      setup() {
        const section = useInjected(SECTION);
        const setSection = useInjected(SET_SECTION);
        onMounted(() => {
          seen.push(section.value);
          setter.fn = setSection;
          setSection({ a: [0, 0], b: [10, 0], halfKm: 80 });
        });
        return () => h("div");
      },
    });
    stubWorld();
    const router = createAppRouter(createMemoryHistory());
    await router.push("/earthquakes/wc?section=-122.42,37.77,-118.24,34.05,50");
    const Root = defineComponent({
      setup() {
        provide(API, fakeApi());
        provide(MARKS, createMarks(null));
        provide(
          CLOCK,
          createClock(1e9, () => NOW),
        );
        provide(THEME, fakeTheme());
        provide(SETTINGS, createSettings(null));
        return () => h(RouterView);
      },
    });
    const wrapper = mount(Root, {
      global: { plugins: [router], stubs: { StatusLine: Probe } },
      attachTo: document.body,
    });
    await flushPromises();
    expect(seen).toEqual([{ a: [-122.42, 37.77], b: [-118.24, 34.05], halfKm: 50 }]);
    expect(router.currentRoute.value.query.section).toBe("0,0,10,0,80");
    setter.fn?.(null);
    await flushPromises();
    expect(router.currentRoute.value.query.section).toBeUndefined();
    wrapper.unmount();
  });
});
