import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, provide, type Component } from "vue";
import HelpMenu from "../../src/components/HelpMenu.vue";
import TourCard from "../../src/components/TourCard.vue";
import TourOffer from "../../src/components/TourOffer.vue";
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
    sidePath: true,
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
function target(name: string, top: number) {
  const e = document.createElement("div");
  e.dataset.tour = name;
  e.getBoundingClientRect = () =>
    ({ left: 10, top, right: 110, bottom: top + 40, width: 100, height: 40 }) as DOMRect;
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
    const t1 = target("t1", 900);
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
    expect(w.find(".tourcard").classes()).toContain("top");
    expect(t1.scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    vi.advanceTimersByTime(TRACK_MS * 2);
    expect(t1.scroll).toHaveBeenCalledTimes(1);
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
    await w.find(".tourdetour").trigger("click");
    await flushPromises();
    expect(w.find(".tourpath").text()).toBe("Two › Side · 1 of 1");
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
    expect(w.findAll(".hstate").map((s) => s.text())).toEqual([
      "Not started",
      "Not started",
      "Not started",
    ]);
    expect(w.find(".htour.hside .hsidetag").text()).toBe("· side path");
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
    expect(w.find(".help-btn").attributes("title")).toContain("not seen yet");
    await tour.start("orientation");
    await tour.next();
    await tour.next();
    await nextTick();
    expect(w.find(".help-btn").classes()).toContain("fresh");
    await tour.start("map");
    await tour.exit();
    await nextTick();
    expect(w.find(".help-btn").classes()).not.toContain("fresh");
    expect(w.find(".help-btn").attributes("title")).toBe("Help: quick tours of the app");
    w.unmount();
  });

  it("resumes, restarts and retakes tours, and starts at any step", async () => {
    const { tour, progress, mountIt } = setup();
    progress.record("map", 0, true);
    progress.record("orientation", 1, false);
    const w = mountIt(HelpMenu);
    await w.find(".help-btn").trigger("click");
    expect(w.findAll(".hstate").map((s) => s.text())).toEqual([
      "Step 2 of 3",
      "Done",
      "Not started",
    ]);
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
