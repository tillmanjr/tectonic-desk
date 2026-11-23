import { afterEach, describe, expect, it } from "vitest";
import {
  dockOf,
  domSwitches,
  inView,
  targetElements,
  unionBox,
} from "../../src/lib/tour-target.js";

function el(tour: string, r: { left: number; top: number; width: number; height: number }) {
  const e = document.createElement("div");
  e.dataset.tour = tour;
  e.getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) as DOMRect;
  document.body.append(e);
  return e;
}

describe("tour targets", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the rendered elements naming any target, and joins their boxes", () => {
    const a = el("map.zoom map.tools", { left: 10, top: 20, width: 30, height: 10 });
    const b = el("map.zoom", { left: 50, top: 5, width: 10, height: 10 });
    el("map.zoom", { left: 0, top: 0, width: 0, height: 0 });
    el("map.lock", { left: 0, top: 0, width: 5, height: 5 });
    expect(targetElements([])).toEqual([]);
    expect(targetElements(["map.zoom"])).toEqual([a, b]);
    expect(targetElements(["map.tools"])).toEqual([a]);
    expect(unionBox([a, b])).toEqual({ left: 10, top: 5, right: 60, bottom: 30 });
    expect(unionBox([])).toBeNull();
  });

  it("docks the card away from the target and tells whether a box is in view", () => {
    expect(dockOf(null, 800)).toBe("bottom");
    expect(dockOf({ left: 0, top: 100, right: 10, bottom: 200 }, 800)).toBe("bottom");
    expect(dockOf({ left: 0, top: 500, right: 10, bottom: 700 }, 800)).toBe("top");
    expect(inView({ left: 0, top: 0, right: 100, bottom: 100 }, 100, 100)).toBe(true);
    expect(inView({ left: 0, top: -1, right: 100, bottom: 100 }, 100, 100)).toBe(false);
    expect(inView({ left: 0, top: 0, right: 100, bottom: 101 }, 100, 100)).toBe(false);
    expect(inView({ left: -1, top: 0, right: 100, bottom: 100 }, 100, 100)).toBe(false);
    expect(inView({ left: 0, top: 0, right: 101, bottom: 100 }, 100, 100)).toBe(false);
  });

  it("reads and flips switches: a checkbox inside, or an element with aria-expanded", () => {
    document.body.innerHTML = `
      <label data-tour="mech"><input type="checkbox"> Mechanisms</label>
      <input data-tour="bare" type="checkbox" checked>
      <section data-tour="bar"><div class="head" aria-expanded="false"></div></section>
      <p data-tour="plain">text</p>`;
    const head = document.querySelector<HTMLElement>(".head");
    head?.addEventListener("click", () => {
      head.setAttribute("aria-expanded", String(head.getAttribute("aria-expanded") !== "true"));
    });
    const sw = domSwitches();
    expect(sw.get("mech")).toBe(false);
    expect(sw.get("bare")).toBe(true);
    expect(sw.get("bar")).toBe(false);
    expect(sw.get("plain")).toBeNull();
    expect(sw.get("nothing")).toBeNull();
    sw.set("mech", true);
    sw.set("bar", true);
    sw.set("bar", true);
    sw.set("bare", true);
    sw.set("plain", true);
    expect(sw.get("mech")).toBe(true);
    expect(sw.get("bar")).toBe(true);
    expect(sw.get("bare")).toBe(true);
  });
});
