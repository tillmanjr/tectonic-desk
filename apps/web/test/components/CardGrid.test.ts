import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import CardGrid from "../../src/components/CardGrid.vue";
import { makeContext, mountWith } from "../support/mount.js";

const columns = (n: number) =>
  vi.stubGlobal("getComputedStyle", () => ({
    gridTemplateColumns: Array<string>(n).fill("250px").join(" "),
  }));

describe("CardGrid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("limits the slot to rows × columns, offers the rest, and resets on a region change", async () => {
    columns(4);
    const ctx = await makeContext();
    const w = mountWith(
      {
        setup: () => () =>
          h(
            CardGrid,
            { label: "Major", count: 10, rows: 2 },
            { default: (s: { limit: number | null }) => h("i", String(s.limit)) },
          ),
      },
      ctx,
    );
    await nextTick();
    expect(w.find(".sectionlabel").text()).toBe("Major … 2 more");
    expect(w.find("i").text()).toBe("8");
    await w.find(".more").trigger("click");
    expect(w.find("i").text()).toBe("null");
    expect(w.find(".more").text()).toBe("show fewer");
    expect(w.find(".more").attributes("aria-expanded")).toBe("true");
    columns(2);
    window.dispatchEvent(new Event("resize"));
    await ctx.catalog.setRegion("wc");
    await nextTick();
    expect(w.find("i").text()).toBe("4");
    expect(w.find(".sectionlabel").text()).toBe("Major … 6 more");
    w.unmount();
  });
  it("shows everything with no rows limit or when nothing overflows", async () => {
    const ctx = await makeContext();
    const all = mountWith(CardGrid, ctx, { label: "All", count: 3, rows: null });
    expect(all.find(".more").exists()).toBe(false);
    const fits = mountWith(CardGrid, ctx, { label: "Fits", count: 1, rows: 3 });
    expect(fits.find(".more").exists()).toBe(false);
    expect(fits.find(".sectionlabel").text()).toBe("Fits");
  });
});
