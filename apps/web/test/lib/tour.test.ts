import { zoomIdentity } from "d3-zoom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTour,
  createTourProgress,
  hasUnseen,
  mapSnapshot,
  parseTourProgress,
  TOUR_KEY,
  tourState,
  type Tour,
  type TourId,
} from "../../src/lib/tour.js";
import type { Page } from "../../src/router.js";
import { fakeMap, fakeStage, fakeSwitches } from "../support/tour.js";

const NOW = new Date("2026-11-23T10:00:00Z");
const AT = NOW.toISOString();

function memory(initial: string | null = null) {
  const store = { value: initial, writes: 0 };
  return {
    store,
    storage: {
      getItem: () => store.value,
      setItem: (_k: string, v: string) => {
        store.value = v;
        store.writes++;
      },
    },
  };
}

describe("parseTourProgress", () => {
  it("reads nothing, bad JSON or a non-object as a fresh start", () => {
    const fresh = { offerDismissed: false, last: null, tours: {}, seen: {}, demo: null };
    expect(parseTourProgress(null)).toEqual(fresh);
    expect(parseTourProgress("{")).toEqual(fresh);
    expect(parseTourProgress("3")).toEqual(fresh);
    expect(parseTourProgress(JSON.stringify({ tours: 5 }))).toEqual(fresh);
  });

  it("keeps well-formed records of known tours and drops the rest", () => {
    const raw = JSON.stringify({
      offerDismissed: true,
      last: "map",
      tours: {
        map: { step: 3, done: false, at: AT },
        orientation: { step: -1, done: false, at: AT },
        nope: { step: 0, done: true, at: AT },
      },
    });
    expect(parseTourProgress(raw)).toEqual({
      offerDismissed: true,
      last: "map",
      tours: { map: { step: 3, done: false, at: AT } },
      seen: {},
      demo: null,
    });
    for (const bad of [
      null,
      { step: 1.5, done: false, at: AT },
      { step: 1, done: "no", at: AT },
      { step: 1, done: false, at: 5 },
    ]) {
      const doc = parseTourProgress(JSON.stringify({ last: "nowhere", tours: { map: bad } }));
      expect(doc).toEqual({ offerDismissed: false, last: null, tours: {}, seen: {}, demo: null });
    }
  });
});

describe("createTourProgress", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("reads the stored document, records tours and dismisses the offer once", () => {
    const m = memory(JSON.stringify({ offerDismissed: false, last: null, tours: {} }));
    const p = createTourProgress(m.storage, () => NOW);
    p.record("map", 2, false);
    expect(p.doc.value).toEqual({
      offerDismissed: false,
      last: "map",
      tours: { map: { step: 2, done: false, at: AT } },
      seen: {},
      demo: null,
    });
    p.dismissOffer();
    p.dismissOffer();
    expect(m.store.writes).toBe(2);
    expect(parseTourProgress(m.store.value).offerDismissed).toBe(true);
  });

  it("resets to a first visit", () => {
    const m = memory();
    const p = createTourProgress(m.storage, () => NOW);
    p.record("map", 3, true, "x");
    p.dismissOffer();
    p.reset();
    expect(p.doc.value).toEqual(parseTourProgress(null));
    expect(parseTourProgress(m.store.value)).toEqual(parseTourProgress(null));
  });

  it("starts fresh when storage throws, and keeps progress in memory when writing fails", () => {
    const p = createTourProgress({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    p.record("orientation", 1, true);
    expect(p.doc.value.tours.orientation?.done).toBe(true);
    const none = createTourProgress(null);
    none.dismissOffer();
    expect(none.doc.value.offerDismissed).toBe(true);
  });

  it("uses localStorage by default", () => {
    const p = createTourProgress();
    p.dismissOffer();
    p.record("map", 0, false);
    expect(localStorage.getItem(TOUR_KEY)).toContain('"offerDismissed":true');
  });
});

describe("example marks", () => {
  it("keeps the example marks' ids, drops a malformed record, and survives a reset", () => {
    const p = createTourProgress(null, () => NOW);
    p.setDemo({ group: "g", marks: ["a", "b"] });
    p.reset();
    expect(p.doc.value.demo).toEqual({ group: "g", marks: ["a", "b"] });
    p.setDemo(null);
    expect(p.doc.value.demo).toBeNull();
    const read = (demo: unknown) => parseTourProgress(JSON.stringify({ demo })).demo;
    expect(read({ group: "g", marks: ["a", 3] })).toEqual({ group: "g", marks: ["a"] });
    expect(read({ group: 1, marks: [] })).toBeNull();
    expect(read({ group: "g", marks: "a" })).toBeNull();
    expect(read("x")).toBeNull();
  });
});

describe("continuing to the next tour", () => {
  function three(): Tour[] {
    const one = (id: TourId, title: string, sidePath = false): Tour => ({
      id,
      title,
      blurb: "",
      sidePath,
      pageFor: (p: Page) => p,
      steps: [
        { id: "a", title: "A", body: "", targets: [] },
        {
          id: "b",
          title: "B",
          body: "",
          targets: [],
          leave: () => undefined,
        },
      ],
    });
    return [
      one("orientation", "One"),
      one("mechanism", "Side", true),
      one("map", "Two"),
      one("earthquakes", "Three"),
    ];
  }

  it("offers the next main tour with unseen steps on a last step, and goes on keeping the view", async () => {
    const { stage } = fakeStage();
    const progress = createTourProgress(null, () => NOW);
    const tour = createTour(three(), progress, stage);
    expect(tour.following.value).toBeNull();
    await tour.continueOn();
    await tour.start("orientation");
    expect(tour.following.value).toBeNull();
    await tour.next();
    expect(tour.following.value?.id).toBe("map");
    progress.record("map", 1, false, "a");
    progress.record("map", 1, false, "b");
    expect(tour.following.value?.id).toBe("earthquakes");
    progress.record("earthquakes", 1, false, "a");
    await tour.continueOn();
    expect(tour.active.value?.tour.id).toBe("earthquakes");
    expect(tour.active.value?.index).toBe(1);
    expect(progress.doc.value.tours.orientation?.done).toBe(true);
    expect(stage.restore).not.toHaveBeenCalled();
    expect(tour.following.value).toBeNull();
    await tour.exit();
    expect(stage.clearDemoMarks).toHaveBeenCalled();
    // A tour taken before, with a step added since, starts again from the top.
    const fresh = createTourProgress(null, () => NOW);
    fresh.record("map", 1, true, "a");
    const again = createTour(three(), fresh, fakeStage().stage);
    await again.start("orientation", 1);
    await again.continueOn();
    expect(again.active.value?.tour.id).toBe("map");
    expect(again.active.value?.index).toBe(0);
  });
});

describe("seen steps", () => {
  it("reads the steps shown per tour, keeping only strings of known tours", () => {
    const doc = parseTourProgress(
      JSON.stringify({ seen: { map: ["a", 3, "b"], orientation: "a", nowhere: ["x"] } }),
    );
    expect(doc.seen).toEqual({ map: ["a", "b"] });
  });

  it("marks a step shown once, and says whether any step of the tours is unseen", () => {
    const p = createTourProgress(null, () => NOW);
    const ts = tours([]);
    expect(hasUnseen(p.doc.value, ts)).toBe(true);
    p.record("orientation", 0, false, "a");
    p.record("orientation", 0, false, "a");
    p.record("orientation", 1, false);
    expect(p.doc.value.seen).toEqual({ orientation: ["a"] });
    for (const id of ["b", "c"]) p.record("orientation", 0, false, id);
    expect(hasUnseen(p.doc.value, ts)).toBe(true);
    for (const id of ["x", "y"]) p.record("map", 0, false, id);
    expect(hasUnseen(p.doc.value, ts)).toBe(false);
    const grown = ts.map((t) =>
      t.id === "map"
        ? { ...t, steps: [...t.steps, { id: "z", title: "Z", body: "", targets: [] }] }
        : t,
    );
    expect(hasUnseen(p.doc.value, grown)).toBe(true);
  });
});

describe("tourState", () => {
  it("reads new, partway and done", () => {
    const doc = parseTourProgress(
      JSON.stringify({
        tours: {
          map: { step: 4, done: false, at: AT },
          orientation: { step: 0, done: true, at: AT },
        },
      }),
    );
    expect(tourState(doc, "map")).toEqual({ kind: "partway", step: 4 });
    expect(tourState(doc, "orientation")).toEqual({ kind: "done" });
    expect(tourState(parseTourProgress(null), "map")).toEqual({ kind: "new" });
  });
});

describe("mapSnapshot", () => {
  it("puts back the toggles, field, pin bar, measurement and theater", () => {
    const mv = fakeMap();
    mv.measure.toggle();
    mv.measure.place([1, 2]);
    mv.measure.place([3, 4]);
    const restore = mapSnapshot(mv);
    mv.showPlates.value = false;
    mv.showTeeth.value = false;
    mv.showAurora.value = true;
    mv.field.value = "gravity";
    mv.pin.toggle();
    mv.measure.clear();
    mv.toggleTheater();
    mv.section.toggle();
    mv.setTransform(zoomIdentity.translate(5, 5).scale(3));
    restore();
    expect(mv.transform.value).toBe(zoomIdentity);
    expect(mv.showPlates.value).toBe(true);
    expect(mv.showTeeth.value).toBe(true);
    expect(mv.showAurora.value).toBe(false);
    expect(mv.field.value).toBe("none");
    expect(mv.pin.open.value).toBe(false);
    expect(mv.measure.shown.value).toMatchObject({ a: [1, 2], b: [3, 4] });
    expect(mv.measure.armed.value).toBe(false);
    expect(mv.theater.value).toBe(false);
    expect(mv.section.armed.value).toBe(false);
  });

  it("clears a measurement the reader did not have, and leaves equal state alone", () => {
    const mv = fakeMap();
    const restore = mapSnapshot(mv);
    mv.measure.toggle();
    mv.measure.place([1, 2]);
    mv.measure.place([3, 4]);
    restore();
    expect(mv.measure.shown.value).toBeNull();
    restore();
    expect(mv.measure.shown.value).toBeNull();
  });
});

function tours(log: string[]): Tour[] {
  return [
    {
      id: "orientation",
      title: "One",
      blurb: "first",
      pageFor: () => "active",
      steps: [
        {
          id: "a",
          title: "A",
          body: "",
          targets: [],
          enter: () => {
            log.push("enter a");
          },
          leave: () => {
            log.push("leave a");
          },
        },
        {
          id: "b",
          title: "B",
          body: "",
          targets: [],
          enter: async (ctx) => {
            const mv = await ctx.map();
            if (mv !== null) mv.showPlates.value = false;
            log.push(`enter b ${mv === null ? "without" : "with"} map`);
          },
        },
        { id: "c", title: "C", body: "", targets: [] },
      ],
    },
    {
      id: "map",
      title: "Two",
      blurb: "second",
      pageFor: (p: Page) => p,
      steps: [
        { id: "x", title: "X", body: "", targets: [] },
        { id: "y", title: "Y", body: "", targets: [] },
      ],
    },
  ];
}

function runner(page: Page = "earthquakes", mapWaitMs = 50) {
  const log: string[] = [];
  const { stage, state } = fakeStage(page);
  const progress = createTourProgress(null, () => NOW);
  const tour = createTour(tours(log), progress, stage, { mapWaitMs });
  return { log, stage, state, progress, tour };
}

describe("side paths", () => {
  function withSide(): Tour[] {
    const main: Tour = {
      id: "earthquakes",
      title: "Main",
      blurb: "",
      pageFor: (p: Page) => p,
      steps: [
        { id: "m0", title: "M0", body: "", targets: [] },
        {
          id: "m1",
          title: "M1",
          body: "",
          targets: [],
          detour: { tour: "mechanism", label: "Deeper" },
          leave: () => undefined,
        },
        { id: "m2", title: "M2", body: "", targets: [], detour: { tour: "map", label: "Gone" } },
      ],
    };
    const side: Tour = {
      id: "mechanism",
      title: "Side",
      blurb: "",
      sidePath: true,
      pageFor: (p: Page) => p,
      steps: [
        { id: "s0", title: "S0", body: "", targets: [] },
        { id: "s1", title: "S1", body: "", targets: [] },
      ],
    };
    return [main, side];
  }

  it("takes a side path and comes back at its end or from its first step", async () => {
    const { stage } = fakeStage();
    const progress = createTourProgress(null, () => NOW);
    const tour = createTour(withSide(), progress, stage);
    await tour.detour();
    await tour.start("earthquakes");
    await tour.detour();
    expect(tour.active.value?.tour.id).toBe("earthquakes");
    await tour.next();
    await tour.detour();
    expect(tour.active.value).toMatchObject({ index: 0, parent: { id: "earthquakes" } });
    expect(tour.active.value?.tour.id).toBe("mechanism");
    await tour.next();
    await tour.goTo(0);
    await tour.back();
    expect(tour.active.value).toMatchObject({ index: 1, parent: null });
    expect(progress.doc.value.tours.mechanism).toMatchObject({ step: 0, done: false });
    await tour.detour();
    await tour.next();
    await tour.next();
    expect(tour.active.value?.tour.id).toBe("earthquakes");
    expect(progress.doc.value.tours.mechanism).toMatchObject({ done: true });
    await tour.next();
    await tour.detour();
    expect(tour.active.value?.step.id).toBe("m2");
    await tour.exit();
  });

  it("leaves side paths out of what keeps the Help button lit", () => {
    const progress = createTourProgress(null, () => NOW);
    const tour = createTour(withSide(), progress, fakeStage().stage);
    for (const id of ["m0", "m1", "m2"]) progress.record("earthquakes", 0, false, id);
    expect(tour.unseen.value).toBe(false);
  });
});

describe("tour switches", () => {
  function switchTour(): Tour {
    return {
      id: "earthquakes",
      title: "Three",
      blurb: "",
      pageFor: (p: Page) => p,
      steps: [
        {
          id: "s",
          title: "S",
          body: "",
          targets: [],
          enter: (ctx) => {
            ctx.setSwitch("open", true);
            ctx.setSwitch("on", true);
            ctx.setSwitch("missing", true);
          },
          leave: (ctx) => {
            ctx.setSwitch("open", false);
          },
        },
        {
          id: "t",
          title: "T",
          body: "",
          targets: [],
          enter: (ctx) => {
            ctx.setSwitch("open", true);
          },
        },
      ],
    };
  }

  it("flips a switch as a click would and puts every switch back when the tour ends", async () => {
    const { switches, state, set } = fakeSwitches({ open: false, on: true, gone: false });
    const { stage } = fakeStage();
    const tour = createTour([switchTour()], createTourProgress(null), stage, { switches });
    await tour.start("earthquakes");
    expect(state.get("open")).toBe(true);
    expect(set).not.toHaveBeenCalledWith("on", true);
    await tour.next();
    expect(set.mock.calls).toEqual([
      ["open", true],
      ["open", false],
      ["open", true],
    ]);
    state.delete("open");
    await tour.exit();
    expect(set).toHaveBeenCalledTimes(3);
    state.set("open", false);
    await tour.start("earthquakes", 1);
    expect(state.get("open")).toBe(true);
    await tour.exit();
    expect(state.get("open")).toBe(false);
  });

  it("works on the document by default", async () => {
    const box = document.createElement("label");
    box.dataset.tour = "open";
    box.innerHTML = '<input type="checkbox">';
    document.body.append(box);
    const tour = createTour([switchTour()], createTourProgress(null), fakeStage().stage);
    await tour.start("earthquakes");
    expect(box.querySelector("input")?.checked).toBe(true);
    await tour.exit();
    expect(box.querySelector("input")?.checked).toBe(false);
    box.remove();
  });
});

describe("createTour", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks a tour on its page, waits for the map, and gives the view back at the end", async () => {
    const { log, stage, state, progress, tour } = runner();
    expect(tour.active.value).toBeNull();
    await tour.start("orientation");
    expect(stage.goPage).toHaveBeenCalledWith("active");
    expect(progress.doc.value.offerDismissed).toBe(true);
    expect(tour.active.value?.step.id).toBe("a");
    expect(progress.doc.value.tours.orientation).toEqual({ step: 0, done: false, at: AT });
    const mv = fakeMap();
    const moving = tour.next();
    await new Promise((r) => setTimeout(r, 0));
    tour.attachMap(mv);
    await moving;
    expect(log).toEqual(["enter a", "leave a", "enter b with map"]);
    expect(mv.showPlates.value).toBe(false);
    expect(tour.active.value?.index).toBe(1);
    await tour.next();
    await tour.next();
    expect(tour.active.value).toBeNull();
    expect(mv.showPlates.value).toBe(true);
    expect(stage.restore).toHaveBeenCalledWith("/earthquakes?x=1");
    expect(state.location).toBe("/earthquakes?x=1");
    expect(progress.doc.value.tours.orientation).toEqual({ step: 0, done: true, at: AT });
    expect(tour.resumable.value).toBeNull();
    expect(progress.doc.value.seen.orientation).toEqual(["a", "b", "c"]);
    expect(tour.unseen.value).toBe(true);
    await tour.start("map");
    await tour.next();
    expect(tour.unseen.value).toBe(false);
  });

  it("steps back and jumps, ignoring moves out of range, and exits where it stands", async () => {
    const { log, stage, tour } = runner("active");
    tour.attachMap(fakeMap());
    await tour.start("orientation", 9);
    expect(tour.active.value?.index).toBe(2);
    expect(stage.goPage).not.toHaveBeenCalled();
    await tour.back();
    expect(tour.active.value?.index).toBe(1);
    await tour.goTo(0);
    await tour.back();
    await tour.goTo(7);
    await tour.goTo(-1);
    expect(tour.active.value?.index).toBe(0);
    expect(log).toEqual(["enter b with map", "enter a"]);
    await tour.goTo(1);
    await tour.exit();
    expect(tour.active.value).toBeNull();
    expect(stage.restore).not.toHaveBeenCalled();
    expect(tour.resumable.value).toMatchObject({ step: 1 });
    expect(tour.resumable.value?.tour.id).toBe("orientation");
  });

  it("offers no resume for a tour left without a record, and waits for a map by default", () => {
    const m = memory(JSON.stringify({ last: "map", tours: {} }));
    const tour = createTour(tours([]), createTourProgress(m.storage), fakeStage().stage);
    expect(tour.resumable.value).toBeNull();
  });

  it("does nothing when idle or asked for an unknown tour", async () => {
    const { tour, progress } = runner();
    await tour.next();
    await tour.back();
    await tour.goTo(0);
    await tour.exit();
    // @ts-expect-error an id that no tour has
    await tour.start("nowhere");
    expect(tour.active.value).toBeNull();
    expect(progress.doc.value.tours).toEqual({});
    expect(tour.resumable.value).toBeNull();
  });

  it("goes on without a map when none appears in time", async () => {
    vi.useFakeTimers();
    const { log, tour } = runner("active", 1000);
    await tour.start("orientation");
    const moving = tour.next();
    await vi.advanceTimersByTimeAsync(1000);
    await moving;
    expect(log.at(-1)).toBe("enter b without map");
  });

  it("forgets a map that leaves the page, and waits for the next", async () => {
    const { log, tour } = runner("active");
    const first = fakeMap();
    tour.attachMap(first);
    tour.detachMap(fakeMap());
    tour.detachMap(first);
    await tour.start("orientation");
    const moving = tour.next();
    const second = fakeMap();
    tour.attachMap(second);
    await moving;
    expect(log.at(-1)).toBe("enter b with map");
    expect(first.showPlates.value).toBe(true);
    expect(second.showPlates.value).toBe(false);
    tour.detachMap(second);
    await tour.exit();
    expect(second.showPlates.value).toBe(false);
  });

  it("ends one tour before starting another, and restarts the same one in place", async () => {
    const { log, stage, tour, progress } = runner();
    await tour.start("orientation");
    await tour.start("map");
    expect(stage.restore).toHaveBeenCalledWith("/earthquakes?x=1");
    expect(tour.active.value?.tour.id).toBe("map");
    expect(progress.doc.value.tours.orientation?.done).toBe(false);
    await tour.next();
    await tour.start("map", 0);
    expect(tour.active.value?.index).toBe(0);
    await tour.exit();
    expect(log).toEqual(["enter a"]);
  });

  it("stops a step's set-up once a later move overtakes it", async () => {
    const { log, stage, tour } = runner();
    let release = (): void => undefined;
    stage.goPage.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const first = tour.start("orientation");
    const second = tour.goTo(2);
    await second;
    release();
    await first;
    expect(log).toEqual(["leave a"]);
    expect(tour.active.value?.index).toBe(2);
  });

  it("stops after a slow leave when overtaken, and resumes no tour it no longer has", async () => {
    const log: string[] = [];
    let release = (): void => undefined;
    const slow: Tour = {
      id: "orientation",
      title: "Slow",
      blurb: "",
      pageFor: () => "active",
      steps: [
        {
          id: "a",
          title: "A",
          body: "",
          targets: [],
          enter: () => {
            log.push("enter a");
          },
          leave: () =>
            new Promise<void>((r) => {
              release = r;
            }),
        },
        {
          id: "b",
          title: "B",
          body: "",
          targets: [],
          enter: () => {
            log.push("enter b");
          },
        },
      ],
    };
    const { stage } = fakeStage("active");
    const progress = createTourProgress(null, () => NOW);
    const tour = createTour([slow], progress, stage, { mapWaitMs: 10 });
    await tour.start("orientation");
    const leaving = tour.next();
    await tour.exit();
    release();
    await leaving;
    expect(log).toEqual(["enter a"]);
    progress.record("map", 1, false);
    expect(tour.resumable.value).toBeNull();
  });
});
