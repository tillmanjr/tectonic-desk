import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RangeInputs from "../../src/components/RangeInputs.vue";
import TableFilterHead from "../../src/components/TableFilterHead.vue";

describe("RangeInputs", () => {
  it("emits parsed bounds on change and marks set inputs", async () => {
    const w = mount(RangeInputs, { props: { min: null, max: 30, label: "Depth" } });
    const [lo, hi] = w.findAll("input");
    expect(lo?.attributes("aria-label")).toBe("Depth from");
    expect(hi?.attributes("aria-label")).toBe("Depth to");
    expect(lo?.classes()).not.toContain("set");
    expect(hi?.classes()).toContain("set");
    expect(hi?.element.value).toBe("30");
    await lo?.setValue("4.5");
    await lo?.trigger("change");
    expect(w.emitted("update")?.at(-1)).toEqual([{ min: 4.5, max: 30 }]);
    await hi?.setValue("");
    await hi?.trigger("change");
    expect(w.emitted("update")?.at(-1)).toEqual([{ min: 4.5, max: null }]);
    w.unmount();
  });
});

describe("TableFilterHead", () => {
  it("shows Clear all only when something is set and reports the toggle state", async () => {
    const w = mount(TableFilterHead, { props: { open: false, active: 0 } });
    expect(w.find(".clearall").exists()).toBe(false);
    expect(w.find(".filtertoggle").text()).toBe("Filter ▾");
    expect(w.find(".filtertoggle").classes()).not.toContain("on");
    await w.find(".filtertoggle").trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
    await w.setProps({ open: true, active: 2 });
    expect(w.find(".filtertoggle").text()).toBe("Filter ▴");
    expect(w.find(".filtertoggle").classes()).toContain("on");
    expect(w.find(".filtertoggle").attributes("aria-expanded")).toBe("true");
    await w.find(".clearall").trigger("click");
    expect(w.emitted("clear")).toHaveLength(1);
    w.unmount();
  });
});
