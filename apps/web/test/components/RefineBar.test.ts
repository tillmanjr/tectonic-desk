import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RefineBar from "../../src/components/RefineBar.vue";

describe("RefineBar", () => {
  it("collapses to a summary, expands on the toggle, and reports the hide checkbox", async () => {
    const w = mount(RefineBar, {
      props: {
        dataset: "volcanoes",
        parts: [
          { text: "setting any", set: false },
          { text: "status elevated", set: true },
        ],
        hidden: false,
      },
      slots: { default: "<input class='inner' />", note: "<p class='fnote'>note</p>" },
    });
    expect(w.classes()).toContain("volcanoes");
    expect(w.find(".rwho").text()).toBe("volcanoes");
    expect(w.find(".rsummary").text()).toBe("setting any · status elevated");
    expect(w.findAll(".rsummary .set").map((s) => s.text())).toEqual(["status elevated"]);
    expect(w.find(".inner").exists()).toBe(false);
    expect(w.find(".fnote").text()).toBe("note");
    const toggle = w.find(".rtoggle");
    expect(toggle.text()).toBe("edit");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");
    expect(toggle.text()).toBe("done");
    expect(w.classes()).toContain("expanded");
    expect(w.find(".inner").exists()).toBe(true);
    expect(w.find(".rsummary").exists()).toBe(false);
    expect(w.find(".fnote").exists()).toBe(true);
    await w.find(".rhide input").setValue(true);
    expect(w.emitted("update:hidden")).toEqual([[true]]);
    const stray = new Event("change");
    Object.defineProperty(stray, "target", { value: document.createElement("div") });
    w.find(".rhide input").element.dispatchEvent(stray);
    expect(w.emitted("update:hidden")).toHaveLength(1);
  });
});
