import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, provide, type Component } from "vue";
import DiveMark from "../../src/components/DiveMark.vue";
import HelpMenu from "../../src/components/HelpMenu.vue";
import TourCard from "../../src/components/TourCard.vue";
import TourOffer from "../../src/components/TourOffer.vue";
import TourReturn from "../../src/components/TourReturn.vue";
import { SETTINGS } from "../../src/lib/keys.js";
import { MANUAL, type ManualNav } from "../../src/lib/manual.js";
import { createSettings } from "../../src/lib/settings.js";
import {
  createTour,
  createTourProgress,
  OFFER_DELAY_MS,
  TOUR,
  type Tour,
} from "../../src/lib/tour.js";
import { TRACK_MS } from "../../src/lib/tour-target.js";
import { fakeStage } from "../support/tour.js";

const NOW = new Date("2026-11-23T10:00:00Z");

const TOURS: Tour[] = [
  {
    id: "orientation",
    title: "One",
    blurb: "The first tour.",
    pageFor: () => "active",
    steps: [
      { id: "a", title: "Alpha", body: "First.", targets: ["t1"], tryIt: "Do it." },
      { id: "b", title: "Beta", body: "Second.", targets: ["t2"] },
      { id: "c", title: "Gamma", body: "Third.", targets: [] },
    ],
  },
  {
    id: "map",
    title: "Two",
    blurb: "The second tour.",
    pageFor: (p) => p,
    steps: [
      {
        id: "x",
        title: "Ex",
        body: "Only.",
        targets: [],
        detour: { tour: "mechanism", label: "Look closer" },
      },
    ],
  },
  {
    id: "mechanism",
    title: "Side",
    blurb: "A side path.",
    deep: { area: "Area" },
    pageFor: (p) => p,
    steps: [{ id: "s", title: "Ess", body: "Aside.", targets: [] }],
  },
];

function setup() {
  const { stage } = fakeStage("active");
  const progress = createTourProgress(null, () => NOW);
  const tour = createTour(TOURS, progress, stage, { mapWaitMs: 10 });
  const mountIt = (c: Component, props: Record<string, unknown> = {}) =>
    mount(
      defineComponent({
        setup() {
          provide(TOUR, tour);
          return () => h(c, props);
        },
      }),
      { attachTo: document.body },
    );
  const mountOffer = (props: { eligible: boolean; location: string }) =>
    mount(TourOffer, { props, global: { provide: { [TOUR]: tour } }, attachTo: document.body });
  return { tour, progress, stage, mountIt, mountOffer };
}

/** A target element with a fixed box. */
function target(name: string, top: number, left = 10, width = 100) {
  const e = document.createElement("div");
  e.dataset.tour = name;
  e.getBoundingClientRect = () =>
    ({ left, top, right: left + width, bottom: top + 40, width, height: 40 }) as DOMRect;
  const scroll = vi.fn();
  e.scrollIntoView = scroll;
  document.body.append(e);
  return { el: e, scroll };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("TourCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });

  it("renders nothing until a tour runs, then the step with its place in the tour", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    expect(w.find(".tour").exists()).toBe(false);
    const t1 = target("t1", 900, 10, 40);
    await tour.start("orientation");
    await nextTick();
    await nextTick();
    expect(w.find(".tourpath").text()).toBe("One · 1 of 3");
    expect(w.find("h2").text()).toBe("Alpha");
    expect(w.find("#tour-body").text()).toBe("First.");
    expect(w.find(".tourtry").text()).toBe("Try it. Do it.");
    expect(w.findAll(".tourdot")).toHaveLength(3);
    expect(w.find(".tourdot").attributes("aria-current")).toBe("step");
    expect(w.find(".tourbtn").attributes("disabled")).toBeDefined();
    expect(document.activeElement?.textContent.trim()).toBe("Next");
    expect(w.find(".tourspot").attributes("style")).toContain("left: 4px; top: 894px");
    expect(w.find(".tourspot").classes()).toContain("small");
    expect(w.find(".tourcard").classes()).toContain("bottom");
    expect(t1.scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    vi.advanceTimersByTime(TRACK_MS * 2);
    expect(t1.scroll).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("moves the card only when it would cover the target", async () => {
    const size = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("tourcard") ? 200 : 0;
      });
    const width = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("tourcard") ? 440 : 0;
      });
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    target("t1", 600, 450);
    await tour.start("orientation");
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(TRACK_MS);
    await nextTick();
    expect(w.find(".tourcard").classes()).toContain("top");
    await tour.next();
    vi.advanceTimersByTime(TRACK_MS * 2);
    await nextTick();
    expect(w.find(".tourcard").classes()).toContain("top");
    size.mockRestore();
    width.mockRestore();
    w.unmount();
  });

  it("lets a lookup that lands after the card has gone pass", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    target("t1", 100);
    const started = tour.start("orientation");
    // The step's first lookup is queued behind this render; the card goes before it runs.
    await nextTick();
    w.unmount();
    await started;
    expect(document.querySelector(".tourcard")).toBeNull();
    await tour.exit();
  });

  it("offers to go on to the next tour from a last step", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    await tour.start("orientation", 2);
    await nextTick();
    expect(w.find(".tourdetour").text()).toBe("Continue to Two →");
    await w.find(".tourdetour").trigger("click");
    await flushPromises();
    expect(w.find(".tourpath").text()).toBe("Two · 1 of 1");
    await tour.exit();
    w.unmount();
  });

  it("says when a step's part is not on screen, and dims without a spotlight", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    await tour.start("orientation", 1);
    await nextTick();
    await nextTick();
    expect(w.find(".tourdim").exists()).toBe(true);
    expect(w.find(".tourmiss").exists()).toBe(false);
    vi.advanceTimersByTime(TRACK_MS * 3);
    await nextTick();
    expect(w.find(".tourmiss").text()).toContain("not on screen");
    expect(w.find(".tourcard").classes()).toContain("bottom");
    await tour.next();
    await nextTick();
    vi.advanceTimersByTime(TRACK_MS * 3);
    await nextTick();
    expect(w.find(".tourmiss").exists()).toBe(false);
    expect(w.find(".tourbtn.primary").text()).toBe("Done");
    w.unmount();
  });

  it("leaves a target in view where it is, and jumps without motion when asked", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    const near = target("t1", 100);
    await tour.start("orientation");
    await nextTick();
    await nextTick();
    expect(near.scroll).not.toHaveBeenCalled();
    expect(w.find(".tourspot").classes()).not.toContain("small");
    expect(w.find(".tourcard").classes()).toContain("bottom");
    near.el.remove();
    const far = target("t1", 2000);
    await tour.goTo(1);
    await tour.goTo(0);
    await nextTick();
    await nextTick();
    expect(far.scroll).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    w.unmount();
  });

  it("steps with the buttons, the dots and the arrow keys, and exits on Escape", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    await tour.start("orientation");
    await nextTick();
    await w.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(1);
    await w.find(".tourbtn").trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(0);
    await w.findAll(".tourdot")[2]?.trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(2);
    document.dispatchEvent(key("ArrowLeft"));
    await flushPromises();
    expect(tour.active.value?.index).toBe(1);
    document.dispatchEvent(key("ArrowRight"));
    await flushPromises();
    expect(tour.active.value?.index).toBe(2);
    document.dispatchEvent(key("ArrowLeft", { ctrlKey: true }));
    document.dispatchEvent(key("ArrowLeft", { altKey: true }));
    document.dispatchEvent(key("ArrowLeft", { metaKey: true }));
    document.dispatchEvent(key("x"));
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(key("ArrowLeft"));
    const handled = key("Escape");
    handled.preventDefault();
    document.dispatchEvent(handled);
    await flushPromises();
    expect(tour.active.value?.index).toBe(2);
    document.dispatchEvent(key("Escape"));
    await flushPromises();
    expect(tour.active.value).toBeNull();
    expect(w.find(".tour").exists()).toBe(false);
    document.dispatchEvent(key("ArrowRight"));
    expect(tour.active.value).toBeNull();
    w.unmount();
  });

  it("offers a step's side path and leads back from it", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(TourCard);
    await tour.start("map");
    await nextTick();
    expect(w.find(".tourdetour").text()).toBe("Look closer →");
    expect(w.find(".tourmore").text()).toBe("Also in the Field manual, in the chapter Area.");
    expect(w.find(".tourmore .tourkind.deep").text()).toBe("Field manual");
    expect(w.find(".tourhead .tourkind").text()).toBe("Quick tour");
    await w.find(".tourdetour").trigger("click");
    await flushPromises();
    expect(w.find(".tourpath").text()).toBe("Two › Area: Side · 1 of 1");
    expect(w.find(".tourhead .tourkind.deep").text()).toBe("Deep dive");
    expect(w.find(".tourbtn").attributes("disabled")).toBeUndefined();
    expect(w.find(".tourbtn.primary").text()).toBe("Back to Two");
    expect(w.find(".tourdetour").exists()).toBe(false);
    await w.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(w.find(".tourpath").text()).toBe("Two · 1 of 1");
    await tour.exit();
    w.unmount();
  });

  it("exits from its button and finishes from Done", async () => {
    const { tour, progress, mountIt } = setup();
    const w = mountIt(TourCard);
    await tour.start("orientation");
    await nextTick();
    await w.find(".tourexit").trigger("click");
    await flushPromises();
    expect(tour.active.value).toBeNull();
    await tour.start("map");
    await nextTick();
    await w.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(progress.doc.value.tours.map?.done).toBe(true);
    w.unmount();
  });
});

describe("HelpMenu", () => {
  it("opens and closes, and starts a tour from the top", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(HelpMenu);
    expect(w.find(".helpmenu").exists()).toBe(false);
    await w.find(".help-btn").trigger("click");
    expect(w.find(".help-btn").attributes("aria-expanded")).toBe("true");
    expect(w.find(".hresume").exists()).toBe(false);
    expect(w.findAll(".hstate").map((s) => s.text())).toEqual(["Not started", "Not started"]);
    expect(w.findAll(".hgrouphead").map((h) => h.text())).toEqual(["Quick tours"]);
    expect(w.findAll(".htour b").map((b) => b.text())).toEqual(["One", "Two"]);
    // Outside the app there is no manual to open.
    expect(w.find(".hmanual").exists()).toBe(false);
    expect(w.find(".hgroup.quick .hgroupsub").text()).toContain("at a glance");
    expect(w.find(".hblurb").text()).toBe("The first tour.");
    w.find(".hblurb").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".helpmenu").exists()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".helpmenu").exists()).toBe(false);
    await w.find(".help-btn").trigger("click");
    await w.find(".helpmenu").trigger("keydown", { key: "x" });
    expect(w.find(".helpmenu").exists()).toBe(true);
    await w.find(".helpmenu").trigger("keydown", { key: "Escape" });
    expect(w.find(".helpmenu").exists()).toBe(false);
    await w.find(".help-btn").trigger("click");
    await w.find(".htour .tourbtn.primary").trigger("click");
    await flushPromises();
    expect(w.find(".helpmenu").exists()).toBe(false);
    expect(tour.active.value?.tour.id).toBe("orientation");
    expect(tour.active.value?.index).toBe(0);
    w.unmount();
  });

  it("stands out until every step has been shown, then turns quiet", async () => {
    const { tour, mountIt } = setup();
    const w = mountIt(HelpMenu);
    expect(w.find(".help-btn").classes()).toContain("fresh");
    expect(w.find(".help-btn").attributes("data-hint")).toContain("not seen yet");
    await tour.start("orientation");
    await tour.next();
    await tour.next();
    await nextTick();
    expect(w.find(".help-btn").classes()).toContain("fresh");
    await tour.start("map");
    await tour.exit();
    await nextTick();
    expect(w.find(".help-btn").classes()).not.toContain("fresh");
    expect(w.find(".help-btn").attributes("data-hint")).toBe("Help: quick tours of the app");
    w.unmount();
  });

  it("resets every tour from the foot of the menu, ending a running one first", async () => {
    const { tour, progress, mountIt } = setup();
    await tour.start("map");
    const w = mountIt(HelpMenu);
    await w.find(".help-btn").trigger("click");
    expect(w.findAll(".hstate")[1]?.text()).toBe("Step 1 of 1");
    await w.find(".hreset button").trigger("click");
    await w.find(".hreset .yes").trigger("click");
    await flushPromises();
    expect(tour.active.value).toBeNull();
    expect(progress.doc.value).toMatchObject({ offerDismissed: false, tours: {}, seen: {} });
    expect(w.findAll(".hstate").map((s) => s.text())).toEqual(["Not started", "Not started"]);
    expect(w.find(".help-btn").classes()).toContain("fresh");
    w.unmount();
  });

  it("resumes, restarts and retakes tours, and starts at any step", async () => {
    const { tour, progress, mountIt } = setup();
    progress.record("map", 0, true);
    progress.record("orientation", 1, false);
    const w = mountIt(HelpMenu);
    await w.find(".help-btn").trigger("click");
    expect(w.findAll(".hstate").map((s) => s.text())).toEqual(["Step 2 of 3", "Done"]);
    expect(w.find(".hresume").text()).toBe("Resume One at step 2");
    expect(w.findAll(".htour")[1]?.find(".tourbtn.primary").text()).toBe("Take again");
    await w.find(".hresume").trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(1);
    await w.find(".help-btn").trigger("click");
    const first = w.findAll(".htour")[0];
    expect(first?.find(".tourbtn.primary").text()).toBe("Resume");
    await first?.findAll(".tourbtn")[1]?.trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(0);
    await w.find(".help-btn").trigger("click");
    await w.findAll(".htour")[0]?.findAll(".tourbtn")[0]?.trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(0);
    await w.find(".help-btn").trigger("click");
    await w.findAll(".hsteps li button")[2]?.trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(2);
    await w.find(".help-btn").trigger("click");
    await w.findAll(".htour")[1]?.find(".tourbtn.primary").trigger("click");
    await flushPromises();
    expect(tour.active.value?.tour.id).toBe("map");
    await w.find(".help-btn").trigger("click");
    w.unmount();
  });
});

describe("TourOffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function shown(eligible = true) {
    const s = setup();
    const w = s.mountOffer({ eligible, location: "/active" });
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    await nextTick();
    return { ...s, w };
  }

  it("is offered on a plain visit once the page settles, and takes the tour", async () => {
    const s = setup();
    const w = s.mountOffer({ eligible: true, location: "/active" });
    expect(w.find(".touroffer").exists()).toBe(false);
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    await nextTick();
    expect(w.find(".touroffer").text()).toContain("New here?");
    const take = w.find(".touroffer .tourbtn");
    document.dispatchEvent(key("Tab"));
    take.element.dispatchEvent(key("Enter"));
    take.element.dispatchEvent(key(" "));
    take.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".touroffer").exists()).toBe(true);
    expect(s.progress.doc.value.offerDismissed).toBe(false);
    await take.trigger("click");
    await flushPromises();
    expect(w.find(".touroffer").exists()).toBe(false);
    expect(s.tour.active.value?.tour.id).toBe("orientation");
    expect(s.progress.doc.value.offerDismissed).toBe(true);
    w.unmount();
  });

  it("goes for good on any other action", async () => {
    const actions: ((w: Awaited<ReturnType<typeof shown>>["w"]) => Promise<void> | void)[] = [
      () => {
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      },
      (w) => {
        w.find(".touroffx").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      },
      () => {
        document.dispatchEvent(key("Enter"));
      },
      () => {
        document.dispatchEvent(new Event("wheel"));
      },
      () => {
        document.dispatchEvent(new Event("touchmove"));
      },
      (w) => w.setProps({ location: "/active?event=us1" }),
    ];
    for (const act of actions) {
      const { w, progress } = await shown();
      await act(w);
      await nextTick();
      expect(w.find(".touroffer").exists()).toBe(false);
      expect(progress.doc.value.offerDismissed).toBe(true);
      w.unmount();
    }
  });

  it("is not offered to a shared link, after a dismissal, or while a tour runs", async () => {
    const link = await shown(false);
    expect(link.w.find(".touroffer").exists()).toBe(false);
    link.w.unmount();

    const s = setup();
    s.progress.dismissOffer();
    const gone = s.mountOffer({ eligible: true, location: "/active" });
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    await nextTick();
    expect(gone.find(".touroffer").exists()).toBe(false);
    gone.unmount();

    const busy = setup();
    const w = busy.mountOffer({ eligible: true, location: "/active" });
    await w.setProps({ location: "/active?x=1" });
    await busy.tour.start("map");
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    await nextTick();
    expect(w.find(".touroffer").exists()).toBe(false);
    w.unmount();

    const late = setup();
    const v = late.mountOffer({ eligible: true, location: "/active" });
    late.progress.record("map", 0, false);
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    await nextTick();
    expect(v.find(".touroffer").exists()).toBe(true);
    v.unmount();
  });

  it("hides when the tour starts elsewhere, and clears its timer on leaving", async () => {
    const { w, tour } = await shown();
    await tour.start("map");
    await nextTick();
    expect(w.find(".touroffer").exists()).toBe(false);
    w.unmount();
    const s = setup();
    const early = s.mountOffer({ eligible: true, location: "/active" });
    early.unmount();
    vi.advanceTimersByTime(OFFER_DELAY_MS);
    expect(s.progress.doc.value.offerDismissed).toBe(false);
  });
});

/** The runner, a manual whose actions are spies, and settings, as the app provides them. */
function inApp() {
  const base = setup();
  const settings = createSettings(null);
  const manual: ManualNav = {
    open: computed(() => false),
    at: computed(() => ({ chapter: "intro", card: null })),
    show: vi.fn(),
    take: vi.fn(),
  };
  const mountApp = (c: Component, props: Record<string, unknown> = {}) =>
    mount(
      defineComponent({
        setup() {
          provide(TOUR, base.tour);
          provide(MANUAL, manual);
          provide(SETTINGS, settings);
          return () => h(c, props);
        },
      }),
      { attachTo: document.body },
    );
  return { ...base, settings, manual, mountApp };
}

describe("HelpMenu in the app", () => {
  it("opens the Field manual from its foot", async () => {
    const { manual, mountApp } = inApp();
    const w = mountApp(HelpMenu);
    await w.find(".help-btn").trigger("click");
    expect(w.find(".hmanual").text()).toContain("Open the Field manual");
    await w.find(".hmanual").trigger("click");
    expect(manual.show).toHaveBeenCalledWith();
    expect(w.find(".helpmenu").exists()).toBe(false);
    w.unmount();
  });
});

describe("DiveMark", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing outside the app, for an area without deep dives, or with the marks off", () => {
    const { mountIt, mountApp, settings } = inApp();
    expect(mountIt(DiveMark, { area: "Area" }).find(".divemark").exists()).toBe(false);
    expect(mountApp(DiveMark, { area: "Nowhere" }).find(".divemark").exists()).toBe(false);
    settings.set({ ...settings.current.value, diveMarks: false });
    expect(mountApp(DiveMark, { area: "Area" }).find(".divemark").exists()).toBe(false);
  });

  it("shows by default where no settings are given", () => {
    const { tour, manual } = inApp();
    const w = mount(DiveMark, {
      props: { area: "Area" },
      global: { provide: { [TOUR]: tour, [MANUAL]: manual } },
      attachTo: document.body,
    });
    expect(w.find(".divemark").exists()).toBe(true);
  });

  it("lists its area's deep dives with their state, takes one, and leads to the chapter", async () => {
    const { tour, progress, manual, mountApp } = inApp();
    const w = mountApp(DiveMark, { area: "Area", dive: "mechanism" });
    const btn = w.find(".divebtn");
    expect(btn.attributes("aria-label")).toBe("Deep dives on Area");
    expect(btn.attributes("data-hint")).toBe("Deep dives on Area: 0 of 1 taken");
    expect(w.find(".divemark").classes()).not.toContain("taken");
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("true");
    expect(w.find(".diverow").text()).toBe("○Side1");
    expect(w.find(".diverow").classes()).toContain("here");
    expect(w.find(".divecount").text()).toBe("0 of 1");
    await w.find(".diverow").trigger("click");
    await flushPromises();
    expect(w.find(".divepop").exists()).toBe(false);
    expect(tour.active.value?.tour.id).toBe("mechanism");
    await tour.exit();
    progress.record("mechanism", 0, false);
    await btn.trigger("click");
    expect(w.find(".diverow").text()).toBe("◐Side1 of 1");
    await w.find(".diverow").trigger("click");
    await flushPromises();
    expect(tour.active.value?.index).toBe(0);
    await tour.next();
    await nextTick();
    expect(w.find(".divemark").classes()).toContain("taken");
    await btn.trigger("click");
    expect(w.find(".diverow").text()).toBe("✓Side1");
    await w.find(".divechapter").trigger("click");
    expect(manual.show).toHaveBeenCalledWith("area");
    expect(w.find(".divepop").exists()).toBe(false);
    w.unmount();
  });

  it("closes on Escape or a press outside, keeps its keys from the bar around it, and tidies up", async () => {
    const { mountApp } = inApp();
    const outer = vi.fn();
    const w = mountApp(
      defineComponent({
        setup: () => () => h("div", { onKeydown: outer }, [h(DiveMark, { area: "Area" })]),
      }),
    );
    await w.find(".divebtn").trigger("click");
    w.find(".divepop").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".divepop").exists()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".divepop").exists()).toBe(false);
    await w.find(".divebtn").trigger("click");
    await w.find(".divepop").trigger("keydown", { key: "x" });
    expect(w.find(".divepop").exists()).toBe(true);
    await w.find(".divepop").trigger("keydown", { key: "Escape" });
    expect(w.find(".divepop").exists()).toBe(false);
    expect(outer).not.toHaveBeenCalled();
    await w.find(".divebtn").trigger("click");
    w.unmount();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
});

describe("TourReturn", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const FROM = { view: "/active", returnTo: "/manual#area/mechanism" };

  it("shows only after a tour taken from the manual, and goes back on Enter or its button", async () => {
    const { tour, stage, mountIt } = setup();
    const w = mountIt(TourReturn);
    expect(w.find(".tourreturn").exists()).toBe(false);
    await tour.start("mechanism", 0, FROM);
    await tour.next();
    await flushPromises();
    expect(w.find(".tourreturn").exists()).toBe(true);
    expect(document.activeElement?.textContent).toContain("Back to the Field manual");
    // Enter on the focused button is the button's own click, not a second go.
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(stage.go).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    expect(w.find(".tourreturn").exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();
    expect(stage.go).toHaveBeenCalledWith("/manual#area/mechanism");
    expect(w.find(".tourreturn").exists()).toBe(false);
    await tour.start("mechanism", 0, FROM);
    await tour.exit();
    await flushPromises();
    await w.find(".tourreturn .tourbtn.primary").trigger("click");
    await flushPromises();
    expect(stage.go).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("stays on Escape or its button, and stops listening once gone", async () => {
    const { tour, stage, mountIt } = setup();
    const w = mountIt(TourReturn);
    await tour.start("mechanism", 0, FROM);
    await tour.exit();
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(w.find(".tourreturn").exists()).toBe(false);
    await tour.start("mechanism", 0, FROM);
    await tour.exit();
    await flushPromises();
    await w.findAll(".tourreturn .tourbtn")[1]?.trigger("click");
    await flushPromises();
    expect(w.find(".tourreturn").exists()).toBe(false);
    expect(stage.go).not.toHaveBeenCalled();
    await tour.start("mechanism", 0, FROM);
    await tour.exit();
    await flushPromises();
    w.unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();
    expect(stage.go).not.toHaveBeenCalled();
  });
});
