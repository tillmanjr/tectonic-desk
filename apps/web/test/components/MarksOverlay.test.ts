import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MarksOverlay from "../../src/components/MarksOverlay.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import type { MarkDraft } from "../../src/lib/marks.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith, type Context } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/wc?event=us1",
  frame: "world",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};
const etna: MarkDraft = {
  ...quake,
  kind: "volcano",
  ref: "211060",
  name: "Etna watch",
  url: "/volcanoes?volcano=211060",
  headline: "Etna",
  sub: "Italy · Mediterranean",
  stamp: null,
};

async function open(ctx: Context, group = "all", panels = false) {
  ctx.overlay.value = { group, panels };
  const w = mountWith(MarksOverlay, ctx);
  await flushPromises();
  return w;
}

describe("MarksOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetBasemapCache();
    document.body.classList.remove("marks-open");
  });

  it("lists marks newest first with rail counts, renames, deletes and opens a view", async () => {
    stubWorld();
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const b = ctx.marks.add(etna);
    const w = await open(ctx);
    expect(document.body.classList.contains("marks-open")).toBe(true);
    expect(document.activeElement?.className).toBe("marks-close");
    expect(w.find("h2").text()).toBe("Marked events");
    expect(w.find(".marks-rail [aria-current=true]").text()).toBe("All · 2");
    const rows = w.findAll(".markrow-item");
    expect(rows.map((r) => r.find(".mname").text())).toEqual(["Etna watch", "Kuril shock"]);
    expect(rows[1]?.text()).toContain("2026-10-13 10:00 UTC");
    expect(rows[0]?.text()).toContain("marked 2026-10-");
    expect(rows[0]?.text()).toContain("no groups yet");
    expect(w.findAll("svg.thumb")).toHaveLength(2);
    const row = rows[0];
    if (row === undefined) throw new Error("no row");
    await row.find(".mname").trigger("click");
    const input = row.find("input");
    await input.setValue("Etna, renamed");
    await input.trigger("keydown", { key: "Enter" });
    expect(ctx.marks.marks.value[0]?.name).toBe("Etna, renamed");
    await input.trigger("blur");
    expect(ctx.marks.marks.value[0]?.name).toBe("Etna, renamed");
    await row.find(".mname").trigger("click");
    await row.find("input").trigger("keydown", { key: "a" });
    await row.find("input").trigger("keydown", { key: "Escape" });
    expect(row.find("input").exists()).toBe(false);
    await row.find(".mname").trigger("click");
    await row.find("input").setValue("Blurred");
    await row.find("input").trigger("blur");
    expect(ctx.marks.marks.value[0]?.name).toBe("Blurred");
    await row.find(".openview").trigger("click");
    expect(ctx.nav.goTo).toHaveBeenCalledWith("/volcanoes?volcano=211060");
    await row.find(".confirm > button").trigger("click");
    await row.find("button.yes").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).not.toContain(b.id);
    expect(w.findAll(".markrow-item")).toHaveLength(1);
    w.unmount();
    expect(document.body.classList.contains("marks-open")).toBe(false);
  });

  it("creates, renames and deletes groups and toggles membership", async () => {
    stubWorld();
    const ctx = await makeContext();
    const a = ctx.marks.add(quake);
    const w = await open(ctx);
    await w.find(".newgroup").trigger("click");
    await w.find(".newgroup-input").setValue("Cascadia");
    await w.find(".newgroup-input").trigger("keydown", { key: "Enter" });
    const g = ctx.marks.groups.value[0];
    if (g === undefined) throw new Error("no group");
    expect(g.name).toBe("Cascadia");
    expect(ctx.nav.list).toHaveBeenCalledWith(g.id);
    await w.find(".newgroup").trigger("click");
    await w.find(".newgroup-input").trigger("keydown", { key: "a" });
    await w.find(".newgroup-input").trigger("keydown", { key: "Escape" });
    expect(w.find(".newgroup-input").exists()).toBe(false);
    expect(w.findAll(".marks-rail button")[1]?.text()).toBe("Cascadia · 0");
    await w.find(".chip").trigger("click");
    expect(ctx.marks.groupsOf(a.id).map((x) => x.id)).toEqual([g.id]);
    expect(w.find(".chip").attributes("aria-pressed")).toBe("true");
    expect(w.findAll(".marks-rail button")[1]?.text()).toBe("Cascadia · 1");
    await w.find(".chip").trigger("click");
    expect(ctx.marks.groupsOf(a.id)).toEqual([]);
    await w.findAll(".marks-rail button")[1]?.trigger("click");
    expect(ctx.nav.list).toHaveBeenLastCalledWith(g.id);
    ctx.overlay.value = { group: g.id, panels: false };
    await nextTick();
    expect(w.find(".marks-main").text()).toContain("No marks in this group yet");
    expect(w.find(".showevents").attributes("disabled")).toBeDefined();
    await w.find(".gname").trigger("click");
    await w.find(".gname-input").setValue("Juan de Fuca");
    await w.find(".gname-input").trigger("keydown", { key: "Enter" });
    expect(ctx.marks.groups.value[0]?.name).toBe("Juan de Fuca");
    await w.find(".gname").trigger("click");
    await w.find(".gname-input").trigger("keydown", { key: "a" });
    await w.find(".gname-input").trigger("keydown", { key: "Escape" });
    expect(w.find(".gname-input").exists()).toBe(false);
    await w.find(".delgroup > button").trigger("click");
    await w.find(".delgroup button.yes").trigger("click");
    expect(ctx.marks.groups.value).toEqual([]);
    expect(ctx.nav.list).toHaveBeenLastCalledWith("all");
    w.unmount();
  });

  it("falls back to All for an unknown group, closes on Escape and the scrim, and shows empty copy", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = await open(ctx, "nope");
    expect(ctx.nav.list).toHaveBeenCalledWith("all");
    ctx.overlay.value = { group: "all", panels: false };
    await nextTick();
    expect(w.find(".marks-main").text()).toContain("Nothing marked yet");
    expect(w.find(".gname").attributes("disabled")).toBeDefined();
    expect(w.find(".delgroup").exists()).toBe(false);
    ctx.overlay.value = null;
    await nextTick();
    expect(w.find(".marks-rail [aria-current=true]").text()).toBe("All · 0");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(2);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(2);
    const input = document.createElement("input");
    input.dataset.keep = "";
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ctx.nav.close).toHaveBeenCalledTimes(2);
    input.remove();
    await w.find(".marks-scrim").trigger("click");
    expect(ctx.nav.close).toHaveBeenCalledTimes(3);
    await w.find(".marks-close").trigger("click");
    expect(ctx.nav.close).toHaveBeenCalledTimes(4);
    w.unmount();
  });

  it("shows a group's panels, loading volcanoes once, and goes back to the list", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    ctx.marks.add(quake);
    ctx.marks.add(etna);
    const load = vi.spyOn(ctx.volcanoes, "load");
    const w = await open(ctx, "all", true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(w.findAll("article.markcard")).toHaveLength(2);
    expect(w.findAll(".panelbody")).toHaveLength(2);
    expect(w.text()).toContain("Origin time");
    expect(w.text()).toContain("Eruptions");
    expect(w.find(".marks-grouphead").exists()).toBe(false);
    await w.find(".backtolist").trigger("click");
    expect(ctx.nav.list).toHaveBeenCalledWith("all");
    await w.find("article.markcard .openview").trigger("click");
    expect(ctx.nav.goTo).toHaveBeenCalledWith("/volcanoes?volcano=211060");
    // volcanoes are loaded now; re-entering the panels does not load again
    ctx.overlay.value = { group: "all", panels: false };
    await nextTick();
    ctx.overlay.value = { group: "all", panels: true };
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("does not load volcanoes for an all-earthquake group and calls show from the list", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const load = vi.spyOn(ctx.volcanoes, "load");
    const w = await open(ctx, "all", true);
    expect(load).not.toHaveBeenCalled();
    ctx.overlay.value = { group: "all", panels: false };
    await nextTick();
    await w.find(".showevents").trigger("click");
    expect(ctx.nav.show).toHaveBeenCalledWith("all");
    w.unmount();
  });
});
