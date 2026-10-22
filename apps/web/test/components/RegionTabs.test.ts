import { describe, expect, it } from "vitest";
import RegionTabs from "../../src/components/RegionTabs.vue";
import { makeContext, mountWith } from "../support/mount.js";

describe("RegionTabs", () => {
  it("lists presets, marks the active one and emits picks", async () => {
    const ctx = await makeContext({ regionId: "wc" });
    const w = mountWith(RegionTabs, ctx);
    const tabs = w.findAll("[role=tab]");
    expect(tabs.map((t) => t.text())).toEqual(["GlobalM4.5+ · 7 d", "West Coast USM2.5+ · 30 d"]);
    expect(tabs.map((t) => t.attributes("title"))).toEqual([
      "M4.5+ · past 7 days",
      "M2.5+ · past 30 days",
    ]);
    expect(tabs.map((t) => t.attributes("aria-selected"))).toEqual(["false", "true"]);
    await tabs[0]?.trigger("click");
    expect(w.findComponent(RegionTabs).emitted("pick")).toEqual([["global"]]);
  });
});
