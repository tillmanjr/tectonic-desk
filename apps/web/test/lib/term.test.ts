import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";
import {
  GLOSSARY,
  TERM_OPEN_EVENT,
  type GlossaryOpen,
  type TermId,
} from "../../src/lib/glossary.js";
import { HINT_DELAY_MS, shownHint } from "../../src/lib/hint.js";
import { modeOf, termHint, vTerm } from "../../src/lib/term.js";

const mode = ref<GlossaryOpen | "bogus" | null>("dblclick");
const id = ref<TermId>("kp");
const Host = defineComponent({
  setup() {
    return () =>
      h("div", mode.value === null ? {} : { "data-glossary-open": mode.value }, [
        withDirectives(h("span", { class: "t" }, "Kp"), [[vTerm, id.value]]),
      ]);
  },
});

const opened: string[] = [];
function listen(e: Event): void {
  if (e instanceof CustomEvent && typeof e.detail === "string") opened.push(e.detail);
}
function pointer(el: Element, type: string, kind: string): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: kind }));
}

describe("vTerm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mode.value = "dblclick";
    id.value = "kp";
    opened.length = 0;
    document.addEventListener(TERM_OPEN_EVENT, listen);
  });
  afterEach(() => {
    document.removeEventListener(TERM_OPEN_EVENT, listen);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads the trigger from the nearest setting, double click when none says", () => {
    const host = document.createElement("div");
    const el = document.createElement("span");
    host.append(el);
    expect(modeOf(el)).toBe("dblclick");
    host.setAttribute("data-glossary-open", "click");
    expect(modeOf(el)).toBe("click");
    host.setAttribute("data-glossary-open", "sideways");
    expect(modeOf(el)).toBe("dblclick");
    expect(termHint("kp", "off")).toBe(GLOSSARY.kp.short);
    expect(termHint("kp", "click")).toBe(`${GLOSSARY.kp.short} · Click for the glossary`);
  });

  it("marks the term, shows its line as the hint, and opens on a double click", async () => {
    const w = mount(Host, { attachTo: document.body });
    const el = w.get(".t").element;
    expect(el.classList.contains("gterm")).toBe(true);
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("data-term")).toBe("kp");
    expect(el.getAttribute("data-hint")).toBe(termHint("kp", "dblclick"));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(shownHint()).toBe(termHint("kp", "dblclick"));
    // a single click does nothing under double click
    await w.get(".t").trigger("click");
    expect(opened).toEqual([]);
    await w.get(".t").trigger("dblclick");
    expect(opened).toEqual(["kp"]);
    expect(shownHint()).toBeNull();
    await w.get(".t").trigger("keydown", { key: "Enter" });
    await w.get(".t").trigger("keydown", { key: "a" });
    expect(opened).toEqual(["kp", "kp"]);
    // a change of setting shows in the hint the next time the pointer comes or focus lands
    mode.value = "click";
    await nextTick();
    pointer(el, "pointerenter", "mouse");
    expect(el.getAttribute("data-hint")).toBe(termHint("kp", "click"));
    await w.get(".t").trigger("dblclick");
    await w.get(".t").trigger("click");
    expect(opened).toEqual(["kp", "kp", "kp"]);
    mode.value = "off";
    await nextTick();
    el.dispatchEvent(new FocusEvent("focus"));
    expect(el.getAttribute("data-hint")).toBe(GLOSSARY.kp.short);
    await w.get(".t").trigger("click");
    await w.get(".t").trigger("dblclick");
    await w.get(".t").trigger("keydown", { key: "Enter" });
    expect(opened).toEqual(["kp", "kp", "kp"]);
    // another term in the same place
    mode.value = null;
    id.value = "dst";
    await nextTick();
    expect(el.getAttribute("data-term")).toBe("dst");
    expect(el.getAttribute("data-hint")).toBe(termHint("dst", "dblclick"));
    w.unmount();
  });

  it("on touch, opens on a second tap while the hint shows, or on a tap under click", async () => {
    const w = mount(Host, { attachTo: document.body });
    const el = w.get(".t").element;
    // first tap: the hint, and its click swallowed
    pointer(el, "pointerdown", "touch");
    pointer(el, "pointerup", "touch");
    expect(shownHint()).toBe(termHint("kp", "dblclick"));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(opened).toEqual([]);
    // second tap while it shows: the entry; the emulated double click that may follow is that tap's
    pointer(el, "pointerdown", "touch");
    pointer(el, "pointerup", "touch");
    expect(opened).toEqual(["kp"]);
    expect(shownHint()).toBeNull();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(opened).toEqual(["kp"]);
    // the mouse's own presses never count as taps
    pointer(el, "pointerdown", "mouse");
    pointer(el, "pointerup", "mouse");
    expect(opened).toEqual(["kp"]);
    // under click a tap opens it at once; under off a tap only shows the hint
    mode.value = "click";
    await nextTick();
    pointer(el, "pointerdown", "pen");
    pointer(el, "pointerup", "pen");
    expect(opened).toEqual(["kp", "kp"]);
    mode.value = "off";
    await nextTick();
    vi.advanceTimersByTime(2000);
    pointer(el, "pointerdown", "touch");
    pointer(el, "pointerup", "touch");
    pointer(el, "pointerdown", "touch");
    pointer(el, "pointerup", "touch");
    expect(opened).toEqual(["kp", "kp"]);
    // a plain event (no pointer type) is no tap
    el.dispatchEvent(new Event("pointerup"));
    expect(opened).toEqual(["kp", "kp"]);
    w.unmount();
    // once unbound, the element no longer answers
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(opened).toEqual(["kp", "kp"]);
  });

  it("leaves an element it never bound alone", () => {
    const el = document.createElement("span");
    const binding = { value: "kp", oldValue: "dst" } as never;
    vTerm.updated?.(el, binding, null as never, null as never);
    vTerm.beforeUnmount?.(el, binding, null as never, null);
    expect(el.dataset.term).toBeUndefined();
  });
});
