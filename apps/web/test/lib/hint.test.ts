import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref, withDirectives } from "vue";
import { HINT_DELAY_MS, shownHint, TOUCH_HOLD_MS, vHint } from "../../src/lib/hint.js";

const outer = ref("Label text");
const inner = ref("Input text");
const Host = defineComponent({
  setup() {
    return () =>
      h("div", [
        withDirectives(
          h("label", { class: "outer" }, [
            h("span", { class: "words" }, "Label"),
            withDirectives(h("input", { class: "inner" }), [[vHint, inner.value]]),
          ]),
          [[vHint, outer.value]],
        ),
        withDirectives(h("button", { class: "empty" }), [[vHint, ""]]),
        h("p", { class: "plain" }, "no hint"),
        withDirectives(h("span", { class: "info" }, "i"), [[vHint, "Info text"]]),
        withDirectives(
          h("label", { class: "check" }, [h("input", { type: "checkbox" }), "Check"]),
          [[vHint, "Check text"]],
        ),
      ]);
  },
});

function over(el: Element, from: Element | null = null): void {
  if (from !== null)
    from.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: el }));
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: from }));
}
function rect(el: Element, top: number, left = 20): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(left, top, 100, 20));
}
const box = (): HTMLElement | null => document.getElementById("hint-float");

describe("vHint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    outer.value = "Label text";
    inner.value = "Input text";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores the text and shows the innermost hint after the delay", () => {
    const w = mount(Host, { attachTo: document.body });
    const label = w.get(".outer").element;
    const input = w.get(".inner").element;
    expect(label.getAttribute("data-hint")).toBe("Label text");
    over(w.get(".words").element);
    vi.advanceTimersByTime(HINT_DELAY_MS - 1);
    expect(shownHint()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(shownHint()).toBe("Label text");
    expect(label.getAttribute("aria-describedby")).toBe("hint-float");
    // Moving onto the input inside swaps to its own hint, after a fresh delay.
    over(input, w.get(".words").element);
    expect(shownHint()).toBeNull();
    expect(label.hasAttribute("aria-describedby")).toBe(false);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBe("Input text");
    // Re-entering the same element keeps the hint.
    over(input);
    expect(shownHint()).toBe("Input text");
    // Leaving for an unhinted element drops it.
    over(w.get(".plain").element, input);
    expect(shownHint()).toBeNull();
    w.unmount();
    expect(box()).toBeNull();
  });

  it("follows text changes while shown and ignores unchanged updates", async () => {
    const w = mount(Host, { attachTo: document.body });
    over(w.get(".inner").element);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    inner.value = "Changed";
    await w.vm.$nextTick();
    expect(shownHint()).toBe("Changed");
    outer.value = "Other label";
    await w.vm.$nextTick();
    expect(w.get(".outer").attributes("data-hint")).toBe("Other label");
    expect(shownHint()).toBe("Changed");
    w.unmount();
  });

  it("places a focus hint below the control, above it near the bottom, inside the sides", () => {
    const w = mount(Host, { attachTo: document.body });
    const input = w.get(".inner").element;
    rect(input, 100, -50);
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(HINT_DELAY_MS);
    const b = box();
    if (b === null) throw new Error("no hint box");
    expect(b.style.top).toBe("126px");
    expect(b.style.left).toBe("8px");
    vi.spyOn(b, "offsetHeight", "get").mockReturnValue(40);
    rect(input, window.innerHeight - 25);
    inner.value = "Low";
    return w.vm.$nextTick().then(() => {
      expect(b.style.top).toBe(`${String(window.innerHeight - 25 - 6 - 40)}px`);
      // No room above either: stays below.
      rect(input, 10);
      vi.spyOn(input, "getBoundingClientRect").mockReturnValue(
        new DOMRect(20, 10, 100, window.innerHeight),
      );
      inner.value = "Tall";
      return w.vm.$nextTick().then(() => {
        expect(b.style.top).toBe(`${String(10 + window.innerHeight + 6)}px`);
        w.unmount();
      });
    });
  });

  it("places a pointer hint clear of the arrow, where the pointer came to rest", () => {
    const w = mount(Host, { attachTo: document.body });
    const input = w.get(".inner").element;
    rect(input, 100);
    input.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 40, clientY: 105 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 60, clientY: 112 }));
    vi.advanceTimersByTime(HINT_DELAY_MS);
    const b = box();
    if (b === null) throw new Error("no hint box");
    expect(b.style.left).toBe("60px");
    expect(b.style.top).toBe(`${String(112 + 20 + 6)}px`);
    // Once shown it stays put.
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 90, clientY: 118 }));
    inner.value = "Moved";
    return w.vm.$nextTick().then(() => {
      expect(b.style.left).toBe("60px");
      // Near the bottom it goes above the pointer.
      vi.spyOn(b, "offsetHeight", "get").mockReturnValue(40);
      over(w.get(".plain").element, input);
      const low = window.innerHeight - 10;
      input.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, clientX: 60, clientY: low }),
      );
      vi.advanceTimersByTime(HINT_DELAY_MS);
      expect(b.style.top).toBe(`${String(low - 6 - 40)}px`);
      w.unmount();
    });
  });

  it("shows nothing for an empty hint", () => {
    const w = mount(Host, { attachTo: document.body });
    over(w.get(".empty").element);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBeNull();
    // A hint whose attribute went away before the delay shows nothing either.
    const input = w.get(".inner").element;
    over(input);
    input.removeAttribute("data-hint");
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBeNull();
    w.unmount();
  });

  it("hides on a press, Escape and scroll, and a click's focus does not bring it back", () => {
    const w = mount(Host, { attachTo: document.body });
    const input = w.get(".inner").element;
    const show = (): void => {
      over(w.get(".plain").element);
      over(input);
      vi.advanceTimersByTime(HINT_DELAY_MS);
      expect(shownHint()).toBe("Input text");
    };
    show();
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(shownHint()).toBeNull();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBeNull();
    show();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(shownHint()).toBe("Input text");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(shownHint()).toBeNull();
    show();
    window.dispatchEvent(new Event("scroll"));
    expect(shownHint()).toBeNull();
    w.unmount();
  });

  it("shows on keyboard focus and drops it when focus leaves", () => {
    const w = mount(Host, { attachTo: document.body });
    const input = w.get(".inner").element;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBe("Input text");
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    expect(shownHint()).toBeNull();
    w.unmount();
  });

  it("drops a pending hint when its element unmounts, and recreates a removed box", () => {
    const w = mount(Host, { attachTo: document.body });
    over(w.get(".inner").element);
    w.unmount();
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBeNull();
    const again = mount(Host, { attachTo: document.body });
    over(again.get(".inner").element);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    box()?.remove();
    over(again.get(".outer").element, again.get(".inner").element);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBe("Label text");
    expect(box()?.isConnected).toBe(true);
    again.unmount();
  });

  describe("touch", () => {
    const touch = (type: string, el: Element, x = 50, y = 110, kind = "touch"): void => {
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: kind }),
      );
    };
    /** Dispatches a click and says whether it reached the document with its default intact. */
    const click = (el: Element): boolean => {
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
      const spy = vi.fn();
      document.addEventListener("click", spy);
      el.dispatchEvent(ev);
      document.removeEventListener("click", spy);
      return spy.mock.calls.length > 0 && !ev.defaultPrevented;
    };
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
    });

    it("shows a control's hint above it after a hold and keeps the release from acting", () => {
      const w = mount(Host, { attachTo: document.body });
      const label = w.get(".check").element;
      rect(label, 100);
      touch("pointerdown", label);
      vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
      expect(shownHint()).toBeNull();
      vi.advanceTimersByTime(1);
      expect(shownHint()).toBe("Check text");
      expect(box()?.style.top).toBe(`${String(100 - 6 - 40)}px`);
      touch("pointerup", label);
      // The emulated mouse and focus events after the touch are not hovers or presses.
      label.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      label.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      label.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
      label.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(shownHint()).toBe("Check text");
      expect(click(label)).toBe(false);
      expect(click(label)).toBe(true);
      // The next touch dismisses it.
      touch("pointerdown", w.get(".plain").element);
      expect(shownHint()).toBeNull();
      touch("pointerup", w.get(".plain").element);
      w.unmount();
    });

    it("shows a hint at once on a tap where the tap does nothing else, below when no room above", () => {
      const w = mount(Host, { attachTo: document.body });
      const info = w.get(".info").element;
      rect(info, 10);
      touch("pointerdown", info);
      touch("pointerup", info);
      expect(shownHint()).toBe("Info text");
      expect(box()?.style.top).toBe(`${String(10 + 20 + 6)}px`);
      expect(click(info)).toBe(false);
      w.unmount();
    });

    it("leaves a tap on a control alone and gives up a hold that moves or is cancelled", () => {
      const w = mount(Host, { attachTo: document.body });
      const label = w.get(".check").element;
      touch("pointerdown", label);
      touch("pointerup", label);
      expect(shownHint()).toBeNull();
      expect(click(label)).toBe(true);
      touch("pointerdown", label, 50, 110);
      touch("pointermove", label, 55, 112);
      touch("pointermove", label, 50, 130);
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(shownHint()).toBeNull();
      touch("pointermove", label, 50, 150);
      touch("pointerdown", label);
      touch("pointercancel", label);
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(shownHint()).toBeNull();
      // A tap on nothing hinted shows nothing.
      touch("pointerdown", w.get(".plain").element);
      touch("pointerup", w.get(".plain").element);
      expect(shownHint()).toBeNull();
      w.unmount();
    });

    it("leaves text inputs their own long press, and ignores mouse pointers", () => {
      const w = mount(Host, { attachTo: document.body });
      const input = w.get(".inner").element;
      touch("pointerdown", input);
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(shownHint()).toBeNull();
      touch("pointerup", input);
      const label = w.get(".check").element;
      touch("pointerdown", label, 50, 110, "mouse");
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      touch("pointerup", label, 50, 110, "mouse");
      expect(shownHint()).toBeNull();
      // Long after the touch, a real hover works again.
      vi.advanceTimersByTime(1000);
      over(label);
      vi.advanceTimersByTime(HINT_DELAY_MS);
      expect(shownHint()).toBe("Check text");
      w.unmount();
    });

    it("keeps the long-press menu off while a hold runs or its hint shows", () => {
      const w = mount(Host, { attachTo: document.body });
      const label = w.get(".check").element;
      const menu = (): boolean => {
        const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
        label.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      expect(menu()).toBe(false);
      touch("pointerdown", label);
      expect(menu()).toBe(true);
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(menu()).toBe(true);
      touch("pointerup", label);
      // A click that never came does not swallow the next tap's.
      touch("pointerdown", label);
      touch("pointerup", label);
      expect(click(label)).toBe(true);
      // A hint shown by the mouse leaves the menu alone.
      vi.advanceTimersByTime(1000);
      over(label);
      vi.advanceTimersByTime(HINT_DELAY_MS);
      expect(menu()).toBe(false);
      w.unmount();
    });

    it("drops a running hold when its element or the last hint unmounts", async () => {
      const shown = ref(true);
      const Lone = defineComponent({
        setup() {
          return () =>
            h("div", [
              shown.value
                ? withDirectives(h("span", { class: "gone" }, "x"), [[vHint, "Gone"]])
                : null,
              withDirectives(h("span", { class: "stay" }, "y"), [[vHint, "Stay"]]),
            ]);
        },
      });
      const w = mount(Lone, { attachTo: document.body });
      touch("pointerdown", w.get(".gone").element);
      shown.value = false;
      await w.vm.$nextTick();
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(shownHint()).toBeNull();
      touch("pointerdown", w.get(".stay").element);
      w.unmount();
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
      expect(shownHint()).toBeNull();
    });
  });
});
