import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapTooltip from "../../src/components/MapTooltip.vue";

describe("MapTooltip", () => {
  it("renders at the given position or not at all", () => {
    expect(
      mount(MapTooltip, { props: { tip: null } })
        .find(".tip")
        .exists(),
    ).toBe(false);
    const w = mount(MapTooltip, { props: { tip: { text: "M5.5 · Tonga", x: 10, y: 20 } } });
    expect(w.find(".tip").text()).toBe("M5.5 · Tonga");
    expect(w.find(".tip").attributes("style")).toContain("left: 10px");
  });
});
