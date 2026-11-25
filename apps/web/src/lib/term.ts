import type { ObjectDirective } from "vue";
import {
  GLOSSARY,
  howToOpen,
  TERM_OPEN_EVENT,
  type GlossaryOpen,
  type TermId,
} from "./glossary.js";
import { attachHint, detachHint, dropHint, hintShownFor, setHint } from "./hint.js";

/**
 * `v-term="id"` links a label on the desk to its Glossary entry. The label shows the entry's
 * one-line definition as its hint, and the reader's trigger (Settings → Open glossary on) sends a
 * bubbling `TERM_OPEN_EVENT` with the id, which the shell turns into the Field manual at that entry.
 * The trigger is read from the nearest `[data-glossary-open]` when it is used, so changing the
 * setting needs no re-render; without one, double click applies. On touch, under double click a tap
 * shows the hint and a second tap while it shows opens the entry; under click a tap opens it.
 */

type Linked = HTMLElement | SVGElement;

const MODES: readonly GlossaryOpen[] = ["dblclick", "click", "off"];
/** A click or double click this soon after a touch opened the entry is that touch's own. */
const AFTER_TOUCH_MS = 800;

export function modeOf(el: Element): GlossaryOpen {
  const host = el.closest("[data-glossary-open]");
  const v = host?.getAttribute("data-glossary-open");
  return MODES.find((m) => m === v) ?? "dblclick";
}

/** The hint for a term under a trigger: its line, then how to open the entry. */
export function termHint(id: TermId, mode: GlossaryOpen): string {
  const how = howToOpen(mode);
  return how === "" ? GLOSSARY[id].short : `${GLOSSARY[id].short} · ${how}`;
}

interface State {
  id: TermId;
  /** Whether the hint was showing when the finger came down. */
  shown: boolean;
  /** When a touch last opened the entry. */
  touchedAt: number;
}
/** Each bound element's state, and how to take its listeners off. */
const states = new WeakMap<Linked, { st: State; off: () => void }>();

/** A finger or a pen, which have no hover. */
const byTouch = (ev: Event): boolean => ev instanceof PointerEvent && ev.pointerType !== "mouse";

function open(el: Linked, id: TermId): void {
  dropHint();
  el.dispatchEvent(new CustomEvent(TERM_OPEN_EVENT, { bubbles: true, detail: id }));
}

function bind(el: Linked, st: State): () => void {
  const refresh = (): void => {
    setHint(el, termHint(st.id, modeOf(el)));
  };
  const down = (ev: Event): void => {
    if (byTouch(ev)) st.shown = hintShownFor(el);
  };
  const up = (ev: Event): void => {
    if (!byTouch(ev)) return;
    const mode = modeOf(el);
    if (mode === "click" || (mode === "dblclick" && st.shown)) {
      ev.stopPropagation();
      st.touchedAt = Date.now();
      open(el, st.id);
    }
  };
  const fromTouch = (): boolean => Date.now() - st.touchedAt < AFTER_TOUCH_MS;
  const click = (): void => {
    if (modeOf(el) === "click" && !fromTouch()) open(el, st.id);
  };
  const dbl = (): void => {
    if (modeOf(el) === "dblclick" && !fromTouch()) open(el, st.id);
  };
  const key = (ev: Event): void => {
    if (ev instanceof KeyboardEvent && ev.key === "Enter" && modeOf(el) !== "off") {
      ev.preventDefault();
      open(el, st.id);
    }
  };
  const pairs: [string, EventListener][] = [
    ["pointerenter", refresh],
    ["focus", refresh],
    ["pointerdown", down],
    ["pointerup", up],
    ["click", click],
    ["dblclick", dbl],
    ["keydown", key],
  ];
  for (const [type, fn] of pairs) el.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of pairs) el.removeEventListener(type, fn);
  };
}

export const vTerm: ObjectDirective<Linked, TermId> = {
  mounted(el, binding) {
    const st: State = { id: binding.value, shown: false, touchedAt: 0 };
    states.set(el, { st, off: bind(el, st) });
    el.classList.add("gterm");
    el.setAttribute("tabindex", "0");
    el.dataset.term = binding.value;
    attachHint(el, termHint(binding.value, modeOf(el)));
  },
  updated(el, binding) {
    const st = states.get(el)?.st;
    if (st === undefined || binding.value === st.id) return;
    st.id = binding.value;
    el.dataset.term = binding.value;
    setHint(el, termHint(binding.value, modeOf(el)));
  },
  beforeUnmount(el) {
    const bound = states.get(el);
    if (bound === undefined) return;
    bound.off();
    states.delete(el);
    detachHint(el);
  },
};
