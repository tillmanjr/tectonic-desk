import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, provide } from "vue";
import { createMemoryHistory, RouterView } from "vue-router";
import type { ApiClient } from "../../src/lib/api.js";
import { createClock } from "../../src/lib/clock.js";
import { API, CLOCK, MARKS, SETTINGS, THEME } from "../../src/lib/keys.js";
import { createMarks, type MarkDraft } from "../../src/lib/marks.js";
import { createSettings } from "../../src/lib/settings.js";
import { createTourProgress, TOUR_PROGRESS, tourTitle, type Tour } from "../../src/lib/tour.js";
import {
  DEMO_GROUP_NAME,
  EXAMPLE_EVENT,
  EXAMPLE_MARKS,
  EXAMPLE_VOLCANO,
  SPACE_HISTORY,
} from "../../src/lib/tour-steps.js";
import { DEEP_DIVES, TOURS } from "../../src/lib/tour-catalog.js";
import { createAppRouter } from "../../src/router.js";
import { fakeApi, listOf, raisedApi } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, mech } from "../support/events.js";
import { fakeTheme, NOW } from "../support/mount.js";
import { spaceWindow } from "../support/space.js";
import { stubWorld } from "../support/world.js";

async function mountApp(
  path: string,
  api: ApiClient = fakeApi(),
  marks = createMarks(null),
  progress = createTourProgress(null, () => NOW),
) {
  stubWorld();
  stubCanvas();
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  const Root = defineComponent({
    setup() {
      provide(API, api);
      provide(MARKS, marks);
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
  return { wrapper, router, progress, marks };
}

type Mounted = Awaited<ReturnType<typeof mountApp>>;

/** The tour with this id. */
function byId(id: string): Tour {
  const t = TOURS.find((x) => x.id === id);
  if (t === undefined) throw new Error(`no tour ${id}`);
  return t;
}

/** Starts a tour from its entry in the Help menu, found by its name. */
async function startFromHelp(m: Mounted, id: string): Promise<void> {
  const t = byId(id);
  await m.wrapper.find(".help-btn").trigger("click");
  const entry = m.wrapper.findAll(".htour").find((e) => e.find("b").text() === tourTitle(t));
  await entry?.find(".tourbtn.primary").trigger("click");
  await flushPromises();
}

/** The `data-tour` names on the page that match nothing. */
function missingTargets(names: readonly string[]): string[] {
  return names.filter((n) => document.querySelector(`[data-tour~="${n}"]`) === null);
}

async function walk(m: Mounted, tourId: string): Promise<string[]> {
  const tour = byId(tourId);
  await startFromHelp(m, tourId);
  const missing: string[] = [];
  for (const [i, step] of tour.steps.entries()) {
    expect(m.wrapper.find(".tourpath").text()).toBe(
      `${tourTitle(tour)} · ${String(i + 1)} of ${String(tour.steps.length)}`,
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
    const missing = await walk(m, "orientation");
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
    const missing = await walk(m, "map");
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
    const missing = await walk(m, "earthquakes");
    expect(missing).toEqual([]);
    await m.wrapper.findAll(".tourdot")[9]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard h2").text()).toBe("Cross-section profile");
    expect(m.router.currentRoute.value.query.event).toBeUndefined();
    expect(m.router.currentRoute.value.query.section).toBeDefined();
    expect(m.wrapper.find(".detail").classes()).not.toContain("open");
    // The Mark step opens the event again.
    await m.wrapper.findAll(".tourdot")[14]?.trigger("click");
    await flushPromises();
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
    await startFromHelp(m, "earthquakes");
    await m.wrapper.findAll(".tourdot")[5]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard h2").text()).toBe("Mechanism");
    await m.wrapper.find(".tourdetour").trigger("click");
    await flushPromises();
    const side = byId("mechanism");
    const missing: string[] = [];
    for (const [i, step] of side.steps.entries()) {
      expect(m.wrapper.find(".tourpath").text()).toBe(
        `Earthquakes › Earthquake detail: Focal mechanism · ${String(i + 1)} of ${String(side.steps.length)}`,
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
    expect(await walk(m, "mechanism")).toEqual([]);
    expect(m.wrapper.find(".tourpath").text()).toBe("Earthquake detail: Focal mechanism · 7 of 7");
    m.wrapper.unmount();
  });

  it("walks the volcanoes tour on Kīlauea and gives the reader's view back", async () => {
    const m = await mountApp("/active");
    expect(await walk(m, "volcanoes")).toEqual([]);
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

  it("walks the marks tour over example marks, and takes them out at the end", async () => {
    const marks = createMarks(null);
    const own = marks.add({ ...EXAMPLE_MARKS[0], name: "my own" } as MarkDraft);
    const m = await mountApp("/active", exampleApi(), marks);
    expect(await walk(m, "marks")).toEqual([]);
    expect(m.progress.doc.value.demo?.marks).toHaveLength(3);
    expect(marks.groups.value.map((g) => g.name)).toEqual([DEMO_GROUP_NAME]);
    await m.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.query.show).toBe("matrix");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(marks.marks.value.map((x) => x.id)).toEqual([own.id]);
    expect(marks.groups.value).toEqual([]);
    expect(m.progress.doc.value.demo).toBeNull();
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    m.wrapper.unmount();
  });

  it("takes out example marks a page left mid-tour, and reuses the group while they are in", async () => {
    const marks = createMarks(null);
    const progress = createTourProgress(null, () => NOW);
    const g = marks.addGroup(DEMO_GROUP_NAME);
    const left = marks.add({ ...EXAMPLE_MARKS[2], name: "left" } as MarkDraft);
    progress.setDemo({ group: g.id, marks: [left.id] });
    const m = await mountApp("/active", fakeApi(), marks, progress);
    expect(marks.marks.value).toEqual([]);
    expect(progress.doc.value.demo).toBeNull();
    await startFromHelp(m, "marks");
    await m.wrapper.findAll(".tourdot")[3]?.trigger("click");
    await flushPromises();
    await m.wrapper.findAll(".tourdot")[4]?.trigger("click");
    await flushPromises();
    expect(marks.groups.value).toHaveLength(1);
    expect(marks.marks.value).toHaveLength(3);
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    m.wrapper.unmount();
  });

  it("goes on from one tour's last step to the next", async () => {
    const m = await mountApp("/active");
    await startFromHelp(m, "orientation");
    await m.wrapper.findAll(".tourdot")[11]?.trigger("click");
    await flushPromises();
    await m.wrapper.find(".tourdetour").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourpath").text()).toBe("Map tools · 1 of 12");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    m.wrapper.unmount();
  });

  it("walks the space tour over a week and eleven years, and ends the tours with nothing to go on to", async () => {
    const m = await mountApp("/active");
    expect(await walk(m, "space")).toEqual([]);
    expect(m.wrapper.find(".tourdetour").exists()).toBe(false);
    await m.wrapper.findAll(".tourdot")[10]?.trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.fullPath).toBe(SPACE_HISTORY);
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    m.wrapper.unmount();
  });

  it("walks Refine: Earthquakes and gives the reader's refinements back", async () => {
    // A catalogue that overflows the page's budget, so the long-window note shows.
    const m = await mountApp("/earthquakes?minMag=5", raisedApi());
    expect(await walk(m, "refine-quakes")).toEqual([]);
    await m.wrapper.findAll(".tourdot")[10]?.trigger("click");
    await flushPromises();
    const hide = m.wrapper.find<HTMLInputElement>('[data-tour~="refine.earthquakes.hide"] input');
    expect(hide.element.checked).toBe(true);
    await m.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(hide.element.checked).toBe(false);
    expect(m.wrapper.find<HTMLSelectElement>(".fspan").element.value).toBe("");
    await m.wrapper.findAll(".tourdot")[6]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find<HTMLSelectElement>(".fspan").element.value).toBe("0");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.router.currentRoute.value.fullPath).toBe("/earthquakes?minMag=5");
    expect(m.wrapper.find(".filters.refine").classes()).not.toContain("expanded");
    m.wrapper.unmount();
  });

  it("reaches Refine: Earthquakes from the Earthquakes tour's refine step, and comes back", async () => {
    const m = await mountApp("/earthquakes");
    await startFromHelp(m, "earthquakes");
    await m.wrapper.findAll(".tourdot")[3]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourmore").text()).toContain("as Refine: Earthquakes");
    await m.wrapper.find(".tourdetour").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourpath").text()).toBe("Earthquakes › Refine: Earthquakes · 1 of 12");
    await m.wrapper.findAll(".tourbtn")[0]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".tourcard h2").text()).toBe("Refine");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    m.wrapper.unmount();
  });

  it("walks Map: Navigation and header and puts the lock, theater and zoom back", async () => {
    const m = await mountApp("/active");
    expect(await walk(m, "map-nav")).toEqual([]);
    await m.wrapper.findAll(".tourdot")[3]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".maplock").attributes("aria-pressed")).toBe("false");
    await m.wrapper.findAll(".tourdot")[9]?.trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".mapcard").classes()).toContain("theater");
    await m.wrapper.find(".tourexit").trigger("click");
    await flushPromises();
    expect(m.wrapper.find(".mapcard").classes()).not.toContain("theater");
    expect(m.wrapper.find(".maplock").attributes("aria-pressed")).toBe("true");
    expect(m.router.currentRoute.value.fullPath).toBe("/active");
    m.wrapper.unmount();
  });

  // Every deep dive, against an app whose data shows every part: an event with a moment tensor
  // and other solutions, in a catalogue large enough to raise the floor.
  for (const deep of DEEP_DIVES) {
    it(`walks the ${tourTitle(deep)} deep dive with every target on screen, and gives the view back`, async () => {
      const quake = event({
        id: EXAMPLE_EVENT.id,
        mechanisms: [mech(), mech({ id: 2, kind: "fm", preferred: false, code: "nc_1" })],
      });
      const api: ApiClient = {
        ...raisedApi([quake]),
        // The window asked for, bucketed past 25 hours as the server does.
        spaceWindow: vi.fn((from: string, to: string) => {
          const long = Date.parse(to) - Date.parse(from) > 25 * 3_600_000;
          return Promise.resolve(spaceWindow({ from, to, bucketSeconds: long ? 3600 : null }));
        }),
        event: vi.fn().mockResolvedValue({
          ...quake,
          firstSeen: "2026-10-12T05:00:00.000Z",
          lastSeen: "2026-10-12T05:00:00.000Z",
          detailCheckedUpdated: null,
          usgs: { title: "M 6.2" },
        }),
      };
      const m = await mountApp("/active", api);
      expect(await walk(m, deep.id)).toEqual([]);
      await m.wrapper.find(".tourexit").trigger("click");
      await flushPromises();
      expect(m.router.currentRoute.value.fullPath).toBe("/active");
      m.wrapper.unmount();
    });
  }

  it("leaves the Space page for the map tour and comes back to it", async () => {
    const m = await mountApp("/space");
    await startFromHelp(m, "map");
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
    await startFromHelp(m, "orientation");
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
    await startFromHelp(empty, "orientation");
    await empty.wrapper.findAll(".tourdot")[7]?.trigger("click");
    await flushPromises();
    expect(empty.router.currentRoute.value.query.event).toBeUndefined();
    empty.wrapper.unmount();
  });
});
