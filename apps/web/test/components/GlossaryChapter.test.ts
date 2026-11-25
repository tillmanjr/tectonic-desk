import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import GlossaryChapter from "../../src/components/GlossaryChapter.vue";
import { GLOSSARY_LIST } from "../../src/lib/glossary.js";
import { MANUAL, type ManualNav } from "../../src/lib/manual.js";
import { TOUR } from "../../src/lib/tour.js";
import { TOURS } from "../../src/lib/tour-catalog.js";

function mounted(hash = { chapter: "glossary", card: null as string | null }, attach = false) {
  const at = ref(hash);
  const from = ref<{ term: string; view: string } | null>(null);
  const manual: ManualNav = {
    open: computed(() => true),
    at: computed(() => at.value),
    show: vi.fn(),
    take: vi.fn(),
    fromDesk: computed(() => from.value),
    backToDesk: vi.fn(),
  };
  const w = mount(GlossaryChapter, {
    ...(attach ? { attachTo: document.body } : {}),
    global: { provide: { [MANUAL]: manual, [TOUR]: { tours: TOURS } } },
  });
  return { w, at, from, manual };
}
const ids = (w: VueWrapper): string[] => w.findAll(".gentry").map((e) => e.element.id.slice(5));

describe("GlossaryChapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("lists every entry A to Z under its letters, with its links", async () => {
    const { w, manual } = mounted();
    expect(ids(w)).toEqual(GLOSSARY_LIST.map((e) => e.id));
    expect(w.find(".gcount").text()).toBe(
      `${String(GLOSSARY_LIST.length)} of ${String(GLOSSARY_LIST.length)} terms`,
    );
    expect(w.findAll(".gletter").map((h) => h.text())[0]).toBe("A");
    const letters = w.findAll(".gletters button");
    expect(letters).toHaveLength(26);
    expect(letters.find((b) => b.text() === "X")?.attributes("disabled")).toBeDefined();
    // not in the page: a jump finds nothing to scroll to
    await letters.find((b) => b.text() === "K")?.trigger("click");
    const kp = w.get("#term-kp");
    expect(kp.find(".gtag").text()).toBe("Space");
    expect(kp.find(".gtag").classes()).toContain("space");
    expect(kp.findAll(".gscale tr")).toHaveLength(3);
    expect(kp.find(".gsrc").text()).toBe("GFZ Potsdam · NOAA SWPC");
    const links = kp.findAll(".glink:not(.gdive)");
    expect(links.map((l) => l.text())).toEqual(["Ap", "Dst", "NOAA scales (G, S, R)"]);
    await links[1]?.trigger("click");
    expect(manual.show).toHaveBeenLastCalledWith("glossary", "dst");
    await kp.get(".gdive").trigger("click");
    expect(manual.show).toHaveBeenLastCalledWith("space", "space-stack");
    // an entry with no see-also, no deep dive and no source shows none
    const pin = w.get("#term-pin");
    expect(pin.text()).not.toContain("See also");
    expect(pin.find(".gsrc").exists()).toBe(false);
    expect(w.get("#term-tectonic-setting").find(".gdive").exists()).toBe(false);
  });

  it("filters by text and by area, and says when nothing matches", async () => {
    const { w } = mounted();
    await w.get(".gfilter").setValue("magnitude");
    expect(ids(w)).toContain("moment-magnitude");
    expect(ids(w)).not.toContain("kp");
    const chips = w.findAll(".gchip");
    expect(chips.map((c) => c.text())).toEqual([
      "All",
      "Earthquakes",
      "Volcanoes",
      "Space",
      "Maps and fields",
      "The desk",
    ]);
    await chips[3]?.trigger("click");
    expect(chips[3]?.attributes("aria-pressed")).toBe("true");
    expect(chips[0]?.attributes("aria-pressed")).toBe("false");
    expect(ids(w)).toEqual([]);
    expect(w.find(".note").text()).toContain("No term matches");
    await w.get(".gfilter").setValue("");
    expect(w.findAll(".gentry .gtag").every((t) => t.text() === "Space")).toBe(true);
    await chips[0]?.trigger("click");
    expect(ids(w)).toHaveLength(GLOSSARY_LIST.length);
  });

  it("lights the entry the address names, clearing a filter that hides it", async () => {
    const { w, at } = mounted({ chapter: "glossary", card: "mmi" }, true);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    await flushPromises();
    expect(w.get("#term-mmi").classes()).toContain("focus");
    await w.findAll(".gchip")[3]?.trigger("click");
    await w.get(".gfilter").setValue("kp");
    at.value = { chapter: "glossary", card: "vei" };
    await flushPromises();
    expect(w.get(".gfilter").element).toHaveProperty("value", "");
    expect(w.get("#term-vei").classes()).toContain("focus");
    expect(scroll).toHaveBeenCalled();
    // a target already in view keeps the filter
    await w.findAll(".gchip")[2]?.trigger("click");
    at.value = { chapter: "glossary", card: "holocene" };
    await flushPromises();
    expect(w.findAll(".gchip")[2]?.attributes("aria-pressed")).toBe("true");
    await w
      .findAll(".gletters button")
      .find((b) => b.text() === "H")
      ?.trigger("click");
    // outside the Glossary no entry is lit
    at.value = { chapter: "map", card: "map-pin" };
    await flushPromises();
    expect(w.find(".gentry.focus").exists()).toBe(false);
    w.unmount();
  });

  it("offers the way back on the entry a term on the desk opened, and only there", async () => {
    const { w, from, manual } = mounted({ chapter: "glossary", card: "kp" });
    expect(w.find(".gback").exists()).toBe(false);
    from.value = { term: "kp", view: "/space?window=7d" };
    await flushPromises();
    expect(w.findAll(".gback")).toHaveLength(1);
    const back = w.get("#term-kp .gback button");
    expect(back.text()).toBe("← Back to the desk");
    expect(back.attributes("data-hint")).toBe("Returns to the view you opened this entry from");
    await back.trigger("click");
    expect(manual.backToDesk).toHaveBeenCalledWith("/space?window=7d");
  });

  it("lights nothing when mounted out of the page", async () => {
    const { w } = mounted({ chapter: "glossary", card: "kp" });
    await flushPromises();
    expect(w.get("#term-kp").classes()).toContain("focus");
  });
});
