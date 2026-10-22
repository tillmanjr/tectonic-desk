import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ConfirmButton from "../../src/components/ConfirmButton.vue";

describe("ConfirmButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks before confirming and reverts on no, Escape or a timeout", async () => {
    vi.useFakeTimers();
    const w = mount(ConfirmButton, { props: { label: "Delete" } });
    expect(w.find("button").text()).toBe("Delete");
    await w.find("button").trigger("click");
    expect(w.text()).toContain("Delete?");
    await w.find("button.no").trigger("click");
    expect(w.find("button").text()).toBe("Delete");
    await w.find("button").trigger("click");
    const stop = vi.fn();
    await w.find("button.yes").trigger("keydown", { key: "Escape", stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(w.find("button.yes").exists()).toBe(false);
    await w.find("button").trigger("click");
    await w.find("button.yes").trigger("keydown", { key: "Tab" });
    expect(w.find("button.yes").exists()).toBe(true);
    vi.advanceTimersByTime(5100);
    await nextTick();
    expect(w.find("button.yes").exists()).toBe(false);
    await w.find("button").trigger("click");
    await w.find("button.yes").trigger("click");
    expect(w.emitted("confirm")).toHaveLength(1);
    expect(w.find("button").text()).toBe("Delete");
    await w.find("button").trigger("click");
    w.unmount();
  });
});
