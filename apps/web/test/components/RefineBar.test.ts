import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RefineBar from "../../src/components/RefineBar.vue";

describe("RefineBar", () => {
  it("collapses to a summary, toggles on the bar and its head, and reports the hide checkbox", async () => {
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
    const head = w.find(".rhead");
    expect(head.attributes("aria-expanded")).toBe("false");
    // collapsed: the hide checkbox's label is the one place that does not expand
    const onLabel = new Event("click", { bubbles: true });
    Object.defineProperty(onLabel, "target", { value: w.find(".rhide").element });
    w.element.dispatchEvent(onLabel);
    await w.vm.$nextTick();
    expect(w.classes()).not.toContain("expanded");
    const noTarget = new Event("click");
    Object.defineProperty(noTarget, "target", { value: null });
    w.element.dispatchEvent(noTarget);
    await w.vm.$nextTick();
    expect(w.classes()).not.toContain("expanded");
    await w.find(".fnote").trigger("click");
    expect(w.classes()).toContain("expanded");
    expect(head.attributes("aria-expanded")).toBe("true");
    // expanded: only the head folds it
    await w.find(".fnote").trigger("click");
    await w.find(".inner").trigger("click");
    expect(w.classes()).toContain("expanded");
    await head.trigger("click");
    expect(w.classes()).not.toContain("expanded");
    await head.trigger("keydown", { key: "Enter" });
    expect(w.classes()).toContain("expanded");
    await head.trigger("keydown", { key: "a" });
    expect(w.classes()).toContain("expanded");
    await head.trigger("keydown", { key: " " });
    expect(w.classes()).not.toContain("expanded");
    await w.find(".rwho").trigger("click");
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
