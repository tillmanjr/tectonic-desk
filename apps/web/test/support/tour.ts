import { vi } from "vitest";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import { computed, ref, shallowRef } from "vue";
import type { MapView } from "../../src/lib/mapview.js";
import type { Section } from "../../src/lib/section.js";
import { useSectionTool } from "../../src/lib/section-tool.js";
import type { StepContext, TourStage } from "../../src/lib/tour.js";
import type { Switches } from "../../src/lib/tour-target.js";
import type { Page } from "../../src/router.js";

/** The parts of a map view the tours touch, over real refs and section tools. */
export function fakeMap(global = true): MapView {
  const measured = ref<Section | null>(null);
  const pinOpen = ref(false);
  const theater = ref(false);
  const transform = shallowRef<ZoomTransform>(zoomIdentity);
  const mv = {
    transform,
    setTransform: (t: ZoomTransform) => {
      transform.value = t;
    },
    view: computed(() => ({ frame: { global } })),
    zoomTo: vi.fn(),
    reset: vi.fn(),
    showPlates: ref(true),
    showTeeth: ref(true),
    showAurora: ref(false),
    field: ref("none"),
    section: useSectionTool(ref(null), () => undefined),
    measure: useSectionTool(measured, (s) => {
      measured.value = s;
    }),
    pin: {
      open: pinOpen,
      toggle: () => {
        pinOpen.value = !pinOpen.value;
      },
      cancel: vi.fn(),
    },
    theater,
    toggleTheater: () => {
      theater.value = !theater.value;
    },
  };
  return mv as unknown as MapView;
}

/** A stage over a plain page and location, with spies for every action. */
export function fakeStage(page: Page = "earthquakes", location = "/earthquakes?x=1") {
  const state = { page, location };
  const stage = {
    page: () => state.page,
    goPage: vi.fn((p: Page) => {
      state.page = p;
      state.location = `/${p}`;
      return Promise.resolve();
    }),
    selectLargest: vi.fn(),
    demoMarks: vi.fn(() => "demo-group"),
    clearDemoMarks: vi.fn(),
    go: vi.fn((url: string) => {
      state.location = url;
      return Promise.resolve();
    }),
    clearSelection: vi.fn(),
    setSection: vi.fn(),
    location: () => state.location,
    restore: vi.fn((to: string) => {
      state.location = to;
      return Promise.resolve();
    }),
  } satisfies TourStage;
  return { stage, state };
}

/** Named switches in memory; a name never set reads as absent. */
export function fakeSwitches(initial: Record<string, boolean> = {}) {
  const state = new Map(Object.entries(initial));
  const set = vi.fn((name: string, on: boolean) => {
    state.set(name, on);
  });
  const switches: Switches = { get: (name) => state.get(name) ?? null, set };
  return { switches, state, set };
}

/** A step context over a fake stage whose map is `mv`. */
export function fakeContext(mv: MapView | null): StepContext {
  return { ...fakeStage().stage, map: () => Promise.resolve(mv), setSwitch: vi.fn() };
}
