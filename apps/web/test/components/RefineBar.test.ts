import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import RefineBar from "../../src/components/RefineBar.vue";
import { UPDATED_MS } from "../../src/lib/refine.js";

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

  describe("status", () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const props = { dataset: "earthquakes" as const, parts: [], hidden: false };

    it("says Updating while fetching, then Updated for a while, and nothing when settled", async () => {
      vi.useFakeTimers();
      const w = mount(RefineBar, { props });
      const state = () => w.find(".rstate");
      expect(state().attributes("role")).toBe("status");
      expect(state().text()).toBe("");
      await w.setProps({ busy: true });
      expect(state().text()).toBe("Updating…");
      expect(state().find(".spin").exists()).toBe(true);
      await w.setProps({ busy: false });
      expect(state().text()).toBe("✓ Updated");
      vi.advanceTimersByTime(UPDATED_MS - 1);
      await w.vm.$nextTick();
      expect(state().text()).toBe("✓ Updated");
      vi.advanceTimersByTime(1);
      await w.vm.$nextTick();
      expect(state().text()).toBe("");
      // A new fetch cuts the message short; unmounting mid-message leaves no timer behind.
      await w.setProps({ busy: true });
      await w.setProps({ busy: false });
      await w.setProps({ busy: true });
      expect(state().text()).toBe("Updating…");
      await w.setProps({ busy: false });
      w.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("says Not updated, with the error in its hint, when the fetch failed", async () => {
      const w = mount(RefineBar, { props: { ...props, busy: true } });
      await w.setProps({ busy: false, error: "HTTP 502" });
      const state = w.find(".rstate");
      expect(state.text()).toBe("Not updated");
      expect(state.classes()).toContain("bad");
      expect(state.find("span").attributes("data-hint")).toBe(
        "The data could not be fetched: HTTP 502",
      );
      await w.setProps({ busy: true });
      expect(state.classes()).not.toContain("bad");
      w.unmount();
    });
  });
});
