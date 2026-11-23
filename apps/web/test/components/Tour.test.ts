import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, provide } from "vue";
import { createMemoryHistory, RouterView } from "vue-router";
import type { ApiClient } from "../../src/lib/api.js";
import { createClock } from "../../src/lib/clock.js";
import { API, CLOCK, MARKS, SETTINGS, THEME } from "../../src/lib/keys.js";
import { createMarks } from "../../src/lib/marks.js";
import { createSettings } from "../../src/lib/settings.js";
import { createTourProgress, TOUR_PROGRESS } from "../../src/lib/tour.js";
import { EXAMPLE_EVENT, EXAMPLE_VOLCANO, TOURS } from "../../src/lib/tour-steps.js";
import { createAppRouter } from "../../src/router.js";
import { fakeApi, listOf } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, mech } from "../support/events.js";
import { fakeTheme, NOW } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

async function mountApp(path: string, api: ApiClient = fakeApi()) {
  stubWorld();
  stubCanvas();
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  const progress = createTourProgress(null, () => NOW);
  const Root = defineComponent({
    setup() {
      provide(API, api);
      provide(MARKS, createMarks(null));
      provide(
        CLOCK,
        createClock(1e9, () => NOW),
      );
      provide(THEME, fakeTheme());
      provide(SETTINGS, createSettings(null));
      provide(TOUR_PROGRESS, progress);
      return () => h(RouterView);
    },
  });
  const wrapper = mount(Root, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router, progress };
}

type Mounted = Awaited<ReturnType<typeof mountApp>>;

async function startFromHelp(m: Mounted, index: number): Promise<void> {
  await m.wrapper.find(".help-btn").trigger("click");
  await m.wrapper.findAll(".htour")[index]?.find(".tourbtn.primary").trigger("click");
  await flushPromises();
}

/** The `data-tour` names on the page that match nothing. */
function missingTargets(names: readonly string[]): string[] {
  return names.filter((n) => document.querySelector(`[data-tour~="${n}"]`) === null);
}

async function walk(m: Mounted, tourIndex: number): Promise<string[]> {
  const tour = TOURS[tourIndex];
  if (tour === undefined) throw new Error("no tour");
  await startFromHelp(m, tourIndex);
  const missing: string[] = [];
  for (const [i, step] of tour.steps.entries()) {
    expect(m.wrapper.find(".tourpath").text()).toBe(
      `${tour.title} · ${String(i + 1)} of ${String(tour.steps.length)}`,
    );
    expect(m.wrapper.find(".tourcard h2").text()).toBe(step.title);
    for (const n of missingTargets(step.targets)) missing.push(`${step.id}: ${n}`);
    if (i < tour.steps.length - 1) {
      await m.wrapper.find(".tourbtn.primary").trigger("click");
      await flushPromises();
    }
  }
  return missing;
}

describe("quick tours in the app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("finds every step's targets on screen, and gives the reader's view back after orientation", async () => {
    const m = await mountApp("/earthquakes/wc?event=us1&tz=local");
    const missing = await walk(m, 0);
    expect(missing).toEqual([]);
    expect(m.router.currentRoute.value.path).toBe("/active/wc");
    await m.wrapper.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard").exists()).toBe(false);
    expect(m.router.currentRoute.value.fullPath).toBe("/earthquakes/wc?event=us1&tz=local");
    expect(m.progress.doc.value.tours.orientation?.done).toBe(true);
    m.wrapper.unmount();
  });

  it("walks the map tools against the real map and puts the map back as it was", async () => {
    const m = await mountApp("/active");
    const plates = m.wrapper.find<HTMLInputElement>('label[data-tour="map.layers"] input');
    await plates.setValue(false);
    const missing = await walk(m, 1);
    expect(missing).toEqual([]);
    expect(m.wrapper.find(".pinbar").exists()).toBe(false);
    expect(m.router.currentRoute.value.query.section).toBeUndefined();
    // Back on the measure step, the example line is on the map and the reader enters theater.
    await m.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.query.section).toBeUndefined();
    expect(m.wrapper.find(".measurebtn").attributes("aria-pressed")).toBe("true");
    expect(plates.element.checked).toBe(true);
    await m.wrapper.find(".theaterbtn").trigger("click");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".mapcard").classes()).not.toContain("theater");
    expect(m.wrapper.find(".measurebtn").attributes("aria-pressed")).toBe("false");
    expect(plates.element.checked).toBe(false);
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    expect(m.progress.doc.value.tours.map).toMatchObject({ step: 7, done: false });
    m.wrapper.unmount();
  });

  /** An API whose one event carries a moment tensor and a second solution, like the example's. */
  function exampleApi(): ApiClient {
    const quake = event({
      id: EXAMPLE_EVENT.id,
      mechanisms: [mech(), mech({ id: 2, kind: "fm", preferred: false, code: "nc_1" })],
    });
    return fakeApi({
      events: vi.fn().mockResolvedValue(listOf([quake])),
      event: vi.fn().mockResolvedValue({
        ...quake,
        firstSeen: "2026-10-12T05:00:00.000Z",
        lastSeen: "2026-10-12T05:00:00.000Z",
        detailCheckedUpdated: null,
        usgs: { title: "M 6.2" },
      }),
    });
  }

  it("walks the earthquakes tour on the example event and folds away what it opened", async () => {
    const m = await mountApp("/active/wc", exampleApi());
    const missing = await walk(m, 2);
    expect(missing).toEqual([]);
    expect(m.router.currentRoute.value.fullPath).toBe(EXAMPLE_EVENT.url);
    await m.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    const shake = m.wrapper.find<HTMLInputElement>('[data-tour~="map.shake"] input');
    expect(shake.element.checked).toBe(true);
    await m.wrapper.findAll(".tourdot")[3]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".filters.refine").classes()).toContain("expanded");
    expect(shake.element.checked).toBe(false);
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".filters.refine").classes()).not.toContain("expanded");
    expect(m.router.currentRoute.value.fullPath).toBe("/active/wc");
    m.wrapper.unmount();
  });

  it("takes the focal mechanism side path from its step and comes back to it", async () => {
    const m = await mountApp("/earthquakes", exampleApi());
    await startFromHelp(m, 2);
    await m.wrapper.findAll(".tourdot")[5]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard h2").text()).toBe("Mechanism");
    await m.wrapper.find(".tourdetour").trigger("click");
    await flushPromises();
    const side = TOURS[3];
    if (side === undefined) throw new Error("no side path");
    const missing: string[] = [];
    for (const [i, step] of side.steps.entries()) {
      expect(m.wrapper.find(".tourpath").text()).toBe(
        `Earthquakes › Focal mechanism · ${String(i + 1)} of ${String(side.steps.length)}`,
      );
      for (const n of missingTargets(step.targets)) missing.push(`${step.id}: ${n}`);
      if (i < side.steps.length - 1) {
        await m.wrapper.find(".tourbtn.primary").trigger("click");
        await flushPromises();
      }
    }
    expect(missing).toEqual([]);
    expect(m.wrapper.find(".tourbtn.primary").text()).toBe("Back to Earthquakes");
    await m.wrapper.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourpath").text()).toBe("Earthquakes · 6 of 16");
    expect(m.progress.doc.value.tours.mechanism?.done).toBe(true);
    await m.wrapper.find(".tourdetour").trigger("click");
    await flushPromises();
    await m.wrapper.findAll(".tourbtn")[0]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard h2").text()).toBe("Mechanism");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.fullPath).toBe("/earthquakes");
    m.wrapper.unmount();
  });

  it("offers the side path on its own from the Help menu", async () => {
    const m = await mountApp("/earthquakes", exampleApi());
    expect(m.wrapper.find(".help-btn").classes()).toContain("fresh");
    expect(await walk(m, 3)).toEqual([]);
    expect(m.wrapper.find(".tourpath").text()).toBe("Focal mechanism · 7 of 7");
    m.wrapper.unmount();
  });

  it("walks the volcanoes tour on Kīlauea and gives the reader's view back", async () => {
    const m = await mountApp("/active");
    expect(await walk(m, 4)).toEqual([]);
    expect(m.router.currentRoute.value.fullPath).toBe(EXAMPLE_VOLCANO.url);
    await m.wrapper.findAll(".tourdot")[3]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".filters.refine.volcanoes").classes()).toContain("expanded");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".filters.refine.volcanoes").classes()).not.toContain("expanded");
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    m.wrapper.unmount();
  });

  it("leaves the Space page for the map tour and comes back to it", async () => {
    const m = await mountApp("/space");
    await startFromHelp(m, 1);
    expect(m.router.currentRoute.value.path).toBe("/active");
    expect(m.wrapper.find(".tourcard h2").text()).toBe("The toolbar");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.path).toBe("/space");
    m.wrapper.unmount();
  });

  it("selects the largest event with a magnitude, and none in an empty window", async () => {
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue(
          listOf([
            event({ id: "small", mag: 4.6 }),
            event({ id: "none", mag: null }),
            event({ id: "big", mag: 6.1 }),
            event({ id: "mid", mag: 5 }),
          ]),
        ),
    });
    const m = await mountApp("/active", api);
    await startFromHelp(m, 0);
    await m.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.query.event).toBe("big");
    await m.wrapper.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.query.event).toBeUndefined();
    m.wrapper.unmount();

    const empty = await mountApp(
      "/active",
      fakeApi({ events: vi.fn().mockResolvedValue(listOf([])) }),
    );
    await startFromHelp(empty, 0);
    await empty.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(empty.router.currentRoute.value.query.event).toBeUndefined();
    empty.wrapper.unmount();
  });
});
