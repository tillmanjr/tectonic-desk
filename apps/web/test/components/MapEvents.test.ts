import type { GeoProjection } from "d3-geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapEvents from "../../src/components/MapEvents.vue";
import { frameFor } from "../../src/lib/geo.js";
import { stubCanvas } from "../support/canvas.js";
import { event, GLOBAL, mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const withMech = event({ id: "mt", mag: 6.5, mechanisms: [mech()], latitude: 10, longitude: 10 });
const plain = event({ id: "plain", mag: 5.0, latitude: 20, longitude: 20 });
const nulls = event({ id: "nulls", mag: null, depthKm: null, latitude: 30, longitude: 30 });

describe("MapEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("draws circles for plain events and beachballs for solved ones, with the selected ring", async () => {
    stubCanvas();
    const ctx = await makeContext();
    const frame = frameFor(GLOBAL);
    const w = mountWith(MapEvents, ctx, {
      frame,
      events: [withMech, plain, nulls],
      k: 1,
      selectedId: "mt",
      showMech: true,
      minMag: 4.5,
    });
    const ev = w.findComponent(MapEvents);
    expect(w.findAll("circle:not(.ring)")).toHaveLength(2);
    expect(w.findAll("g.bb")).toHaveLength(1);
    expect(w.find("circle.ring").exists()).toBe(true);
    expect(w.find("image").attributes("href")).toMatch(/^data:/);
    await w.find("g.bb").trigger("click");
    expect(ev.emitted("select")).toEqual([["mt"]]);
    const plainCircle = w.findAll("circle:not(.ring)")[1];
    await plainCircle?.trigger("mouseenter", { clientX: 5, clientY: 6 });
    expect(ev.emitted("hover")?.[0]?.[0]).toMatchObject({ e: { id: "plain" }, x: 5, y: 6 });
    await plainCircle?.trigger("mouseleave");
    expect(ev.emitted("leave")).toHaveLength(1);
    await plainCircle?.trigger("click");
    expect(ev.emitted("select")).toEqual([["mt"], ["plain"]]);
    await w.find("g.bb").trigger("mouseenter", { clientX: 7, clientY: 8 });
    expect(ev.emitted("hover")?.[1]?.[0]).toMatchObject({ e: { id: "mt" }, x: 7, y: 8 });
    await w.find("g.bb").trigger("mouseleave");
    expect(ev.emitted("leave")).toHaveLength(2);
  });
  it("keeps markers at least the tappable floor when one is set", async () => {
    stubCanvas();
    const ctx = await makeContext();
    const frame = frameFor(GLOBAL);
    const mount = (minRadius: number) =>
      mountWith(MapEvents, ctx, {
        frame,
        events: [withMech, plain],
        k: 4,
        selectedId: null,
        showMech: true,
        minMag: 4.5,
        minRadius,
      });
    const small = mount(0);
    const big = mount(40);
    expect(Number(small.find("circle").attributes("r"))).toBeLessThan(10);
    expect(Number(big.find("circle").attributes("r"))).toBe(10);
    expect(Number(big.find("image").attributes("width"))).toBe(20);
    expect(Number(small.find("image").attributes("width"))).toBeLessThan(20);
  });
  it("draws everything as circles with mechanisms off, scales by zoom, and skips unprojectable points", async () => {
    const ctx = await makeContext();
    const frame = frameFor(GLOBAL);
    const w = mountWith(MapEvents, ctx, {
      frame,
      events: [withMech, plain],
      k: 16,
      selectedId: "plain",
      showMech: false,
      minMag: 4.5,
    });
    const circles = w.findAll("circle");
    expect(circles).toHaveLength(2);
    const selected = circles.find((c) => c.attributes("stroke-width") === "2.2");
    expect(selected).toBeDefined();
    expect(Number(selected?.attributes("r"))).toBeLessThan(2);
    const invisible = (): null => null;
    const far = { ...frame, projection: invisible as unknown as GeoProjection };
    const hidden = mountWith(MapEvents, ctx, {
      frame: far,
      events: [event({ id: "back", latitude: 0, longitude: 180 })],
      k: 1,
      selectedId: null,
      showMech: true,
      minMag: 4.5,
    });
    expect(hidden.findAll("circle")).toHaveLength(0);
  });
});
