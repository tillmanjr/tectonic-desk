import type { Directive } from "vue";

/**
 * Delayed hints for controls: `v-hint="text"` stores the text in `data-hint`,
 * and one document-level listener shows a single floating hint for the
 * innermost hinted element under the pointer (or holding focus) after
 * `HINT_DELAY_MS`. A label and the input inside it can carry their own text;
 * the inner one wins while the pointer is on it. The browser's `title`
 * tooltip has no delay control, so hinted controls carry no `title`.
 */

/** How long the pointer must rest on a control before its hint shows. */
export const HINT_DELAY_MS = 1000;
/** Gap between a control and its hint, in css pixels. */
const GAP_PX = 6;
/** Closest the hint may come to the viewport's sides. */
const EDGE_PX = 8;
const HINT_ID = "hint-float";

let box: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;
let pending: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let users = 0;
/** Set by a press so the focus a click brings does not bring the hint straight back. */
let pressed = false;

function hintedFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-hint]");
  return el instanceof HTMLElement ? el : null;
}

function cancelTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
}

function hide(): void {
  cancelTimer();
  owner?.removeAttribute("aria-describedby");
  owner = null;
  if (box !== null) box.hidden = true;
}

function boxEl(): HTMLDivElement {
  if (!box?.isConnected) {
    box = document.createElement("div");
    box.id = HINT_ID;
    box.className = "hintfloat";
    box.setAttribute("role", "tooltip");
    box.hidden = true;
    document.body.appendChild(box);
  }
  return box;
}

/** Places the hint under the control, or above it when there is no room below, inside the viewport. */
function place(el: HTMLElement, b: HTMLDivElement): void {
  const r = el.getBoundingClientRect();
  const w = b.offsetWidth;
  const h = b.offsetHeight;
  const left = Math.max(EDGE_PX, Math.min(r.left, window.innerWidth - w - EDGE_PX));
  const below = r.bottom + GAP_PX;
  const above = r.top - GAP_PX - h;
  const top = below + h > window.innerHeight && above >= 0 ? above : below;
  b.style.left = `${String(left)}px`;
  b.style.top = `${String(top)}px`;
}

function show(el: HTMLElement): void {
  cancelTimer();
  const text = el.dataset.hint ?? "";
  if (text === "") return;
  owner = el;
  const b = boxEl();
  b.textContent = text;
  b.hidden = false;
  el.setAttribute("aria-describedby", HINT_ID);
  place(el, b);
}

function schedule(el: HTMLElement | null): void {
  if (el === null) {
    hide();
    return;
  }
  if (el === owner || el === pending) return;
  if (owner !== null) hide();
  cancelTimer();
  pending = el;
  timer = setTimeout(() => {
    show(el);
  }, HINT_DELAY_MS);
}

function onOver(ev: MouseEvent): void {
  schedule(hintedFrom(ev.target));
}
/** Leaving for another hinted element (or for none) moves or drops the hint. */
function onOut(ev: MouseEvent | FocusEvent): void {
  schedule(hintedFrom(ev.relatedTarget));
}
function onFocusIn(ev: FocusEvent): void {
  if (pressed) {
    pressed = false;
    return;
  }
  schedule(hintedFrom(ev.target));
}
function onDown(): void {
  pressed = true;
  hide();
}
function onKey(ev: KeyboardEvent): void {
  pressed = false;
  if (ev.key === "Escape") hide();
}

function listen(): void {
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onOut);
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, true);
}
function unlisten(): void {
  document.removeEventListener("mouseover", onOver);
  document.removeEventListener("mouseout", onOut);
  document.removeEventListener("focusin", onFocusIn);
  document.removeEventListener("focusout", onOut);
  document.removeEventListener("mousedown", onDown);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("scroll", hide, true);
}

function setText(el: HTMLElement, text: string): void {
  el.dataset.hint = text;
  if (el !== owner) return;
  const b = boxEl();
  b.textContent = text;
  place(el, b);
}

export const vHint: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    setText(el, binding.value);
    if (users++ === 0) listen();
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) setText(el, binding.value);
  },
  beforeUnmount(el) {
    if (el === owner || el === pending) hide();
    if (--users === 0) {
      unlisten();
      box?.remove();
      box = null;
      pressed = false;
    }
  },
};

/** The hint showing now, or null; for tests. */
export function shownHint(): string | null {
  return box === null || box.hidden ? null : box.textContent;
}
