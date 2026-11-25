import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import MapCentre from "../../src/components/MapCentre.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { DEFAULT_CENTRE } from "../../src/lib/centre.js";
import type { MapView } from "../../src/lib/mapview.js";
import { stubWorld } from "../support/world.js";

function mounted(start = DEFAULT_CENTRE) {
  const centre = ref(start);
  const setCentre = vi.fn((lon: number) => {
    centre.value = lon;
  });
  const mv = { centre, setCentre } as unknown as MapView;
  const w = mount(MapCentre, { props: { mv }, attachTo: document.body });
  return { w, centre, setCentre };
}
const globe = (): Element | null => document.querySelector(".cglobe");
const value = (w: VueWrapper): string => w.get(".cvalue").text();

describe("MapCentre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetBasemapCache();
    document.body.innerHTML = "";
  });

  it("turns the map by 15° either way, wrapping, and back to 150°E", async () => {
    const { w, centre, setCentre } = mounted();
    expect(value(w)).toBe("150°E");
    const [west, east, home] = w.findAll(".cnudge");
    expect(home?.attributes("disabled")).toBeDefined();
    await west?.trigger("click");
    expect(setCentre).toHaveBeenLastCalledWith(135);
    expect(value(w)).toBe("135°E");
    expect(w.get("input").attributes("aria-valuetext")).toBe("135°E");
    expect(home?.attributes("disabled")).toBeUndefined();
    await home?.trigger("click");
    expect(centre.value).toBe(DEFAULT_CENTRE);
    centre.value = 175;
    await flushPromises();
    await east?.trigger("click");
    expect(setCentre).toHaveBeenLastCalledWith(-170);
    expect(value(w)).toBe("170°W");
    w.unmount();
  });

  it("catches a drag at the default, lets keys step through it, and turns the map on release", async () => {
    stubWorld();
    const { w, setCentre } = mounted();
    const input = w.get("input");
    const slide = async (v: string): Promise<void> => {
      input.element.value = v;
      await input.trigger("input");
    };
    await w.get(".centrepick").trigger("pointerdown");
    await slide("3");
    expect(value(w)).toBe("150°E");
    expect(input.element.value).toBe("0");
    await slide("40");
    expect(value(w)).toBe("170°W");
    expect(setCentre).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("pointerup"));
    await input.trigger("change");
    expect(setCentre).toHaveBeenLastCalledWith(-170);
    // keys: no detent
    await slide("3");
    expect(input.element.value).toBe("3");
    expect(value(w)).toBe("153°E");
    await input.trigger("change");
    expect(setCentre).toHaveBeenLastCalledWith(153);
    // a release where it already is turns nothing
    await input.trigger("change");
    expect(setCentre).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("shows a turning globe beside the control while it is in use", async () => {
    stubWorld();
    const { w } = mounted(-30);
    expect(globe()).toBeNull();
    const root = w.get(".centrepick");
    vi.spyOn(root.element, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 600, 300, 30));
    await root.trigger("focusin");
    await flushPromises();
    const g = globe();
    expect(g?.parentElement).toBe(document.body);
    expect(g?.getAttribute("style")).toContain("left: 408px; top: 630px");
    expect(g?.querySelector(".gcap")?.textContent).toBe("30°W · default 150°E");
    expect(g?.querySelector(".gland")?.getAttribute("d")).not.toBe("");
    expect(g?.querySelector(".gnow")?.getAttribute("d")).not.toBe("");
    expect(root.classes()).toContain("active");
    // focus moving within the control keeps it; leaving hides it
    const buttons = w.findAll("button");
    await root.trigger("focusout", { relatedTarget: buttons[0]?.element });
    expect(globe()).not.toBeNull();
    await root.trigger("focusout", { relatedTarget: null });
    expect(globe()).toBeNull();
    // a press shows it too, until the release
    await root.trigger("pointerdown");
    expect(globe()).not.toBeNull();
    document.dispatchEvent(new Event("pointerup"));
    await flushPromises();
    expect(globe()).toBeNull();
    // land already in hand is not fetched again
    await root.trigger("focusin");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await root.trigger("pointerdown");
    w.unmount();
  });

  it("draws the globe without land when it cannot be read", async () => {
    stubWorld(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { w } = mounted();
    await w.get(".centrepick").trigger("focusin");
    await flushPromises();
    expect(err).toHaveBeenCalledWith("globe land failed to load", expect.any(Error));
    expect(globe()?.querySelector(".gland")?.getAttribute("d")).toBe("");
    expect(globe()?.querySelector(".gsea")?.getAttribute("d")).not.toBe("");
    w.unmount();
  });
});
