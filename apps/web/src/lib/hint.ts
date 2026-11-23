import type { Directive } from "vue";

/**
 * Delayed hints for controls: `v-hint="text"` stores the text in `data-hint`,
 * and one document-level listener shows a single floating hint for the
 * innermost hinted element under the pointer (or holding focus) after
 * `HINT_DELAY_MS`. A label and the input inside it can carry their own text;
 * the inner one wins while the pointer is on it. The browser's `title`
 * tooltip has no delay control, so hinted controls carry no `title`.
 *
 * Touch has no hover: a finger held on a hinted control for `TOUCH_HOLD_MS`
 * shows its hint above it and keeps the release from acting on the control;
 * a tap on a hinted element that does nothing itself (an info mark, a text
 * label) shows it at once. The next touch dismisses it. The mouse and focus
 * events a browser emulates after a touch are not hovers and are ignored.
 */

/** How long the pointer must rest on a control before its hint shows. */
export const HINT_DELAY_MS = 1000;
/** How long a finger must rest on a control before its hint shows. */
export const TOUCH_HOLD_MS = 500;
/** Gap between the hint and what it clears (the control, or the pointer's arrow), in css pixels. */
const GAP_PX = 6;
/** How far the arrow cursor reaches below its hot spot; a hint placed under the pointer clears it. */
const CURSOR_PX = 20;
/** Closest the hint may come to the viewport's sides. */
const EDGE_PX = 8;
/** How far a holding finger may drift before the hold counts as a scroll. */
const TOUCH_SLOP_PX = 10;
/** Mouse and focus events trailing a touch by less than this are the browser's emulation. */
const TOUCH_MOUSE_MS = 1000;
/** Elements that act on a tap, so only a hold shows their hint. */
const ACTS_ON_TAP = "button, a, input, select, textarea, label, summary, [role=button]";
/** Elements whose own long press the browser needs (caret, picker); they never start a hold. */
const KEEPS_LONG_PRESS = "input:not([type=checkbox]):not([type=radio]), select, textarea";
const HINT_ID = "hint-float";

/** What can carry a hint: a control, a label, or a mark in a chart's svg. */
type Hinted = HTMLElement | SVGElement;

/** What the hint keeps clear of: the resting pointer, the focused control, or the control under a finger. */
type Anchor = { kind: "pointer"; x: number; y: number } | { kind: "control" } | { kind: "touch" };

let box: HTMLDivElement | null = null;
let owner: Hinted | null = null;
let pending: Hinted | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let users = 0;
/** Set by a press so the focus a click brings does not bring the hint straight back. */
let pressed = false;
let anchor: Anchor = { kind: "control" };
/** When the last finger or pen touched or lifted, for telling emulated mouse events apart. */
let touchAt = Number.NEGATIVE_INFINITY;
let hold: { el: Hinted; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
/** Set when a touch showed a hint, so the click that touch produces does not act. */
let swallowClick = false;

function hintedFrom(target: EventTarget | null): Hinted | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-hint]");
  return el instanceof HTMLElement || el instanceof SVGElement ? el : null;
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

/**
 * Places the hint inside the viewport, clear of what it must not hide. With the pointer it goes
 * under the arrow (above near the bottom), so the cursor never covers the text; with keyboard
 * focus under the control; with a finger above the control, away from the hand.
 */
function place(el: Hinted, b: HTMLDivElement): void {
  const r =
    anchor.kind === "pointer"
      ? { left: anchor.x, top: anchor.y, bottom: anchor.y + CURSOR_PX }
      : el.getBoundingClientRect();
  const w = b.offsetWidth;
  const h = b.offsetHeight;
  const left = Math.max(EDGE_PX, Math.min(r.left, window.innerWidth - w - EDGE_PX));
  const below = r.bottom + GAP_PX;
  const above = r.top - GAP_PX - h;
  const preferAbove = anchor.kind === "touch" || below + h > window.innerHeight;
  const top = preferAbove && above >= 0 ? above : below;
  b.style.left = `${String(left)}px`;
  b.style.top = `${String(top)}px`;
}

function show(el: Hinted): void {
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

function schedule(el: Hinted | null): void {
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

/** True for the emulated mouse and focus events that trail a touch. */
const afterTouch = (): boolean => Date.now() - touchAt < TOUCH_MOUSE_MS;

function onOver(ev: MouseEvent): void {
  if (afterTouch()) return;
  anchor = { kind: "pointer", x: ev.clientX, y: ev.clientY };
  schedule(hintedFrom(ev.target));
}
/** Keeps the resting place current while a hint waits; a shown hint stays put. */
function onMove(ev: MouseEvent): void {
  if (pending !== null && anchor.kind === "pointer") {
    anchor = { kind: "pointer", x: ev.clientX, y: ev.clientY };
  }
}
/** Leaving for another hinted element (or for none) moves or drops the hint. */
function onOut(ev: MouseEvent | FocusEvent): void {
  if (afterTouch()) return;
  schedule(hintedFrom(ev.relatedTarget));
}
function onFocusIn(ev: FocusEvent): void {
  if (pressed || afterTouch()) {
    pressed = false;
    return;
  }
  anchor = { kind: "control" };
  schedule(hintedFrom(ev.target));
}
function onDown(): void {
  if (afterTouch()) return;
  pressed = true;
  hide();
}
function onKey(ev: KeyboardEvent): void {
  pressed = false;
  if (ev.key === "Escape") hide();
}

function cancelHold(): void {
  if (hold !== null) clearTimeout(hold.timer);
  hold = null;
}
function showByTouch(el: Hinted): void {
  anchor = { kind: "touch" };
  swallowClick = true;
  show(el);
}
/** A finger down dismisses any hint and, on a hinted element, starts the hold. */
function onPointerDown(ev: PointerEvent): void {
  if (ev.pointerType === "mouse") return;
  touchAt = Date.now();
  swallowClick = false;
  hide();
  cancelHold();
  const el = hintedFrom(ev.target);
  const t = ev.target;
  if (el === null || (t instanceof Element && t.closest(KEEPS_LONG_PRESS) !== null)) return;
  const at = setTimeout(() => {
    hold = null;
    showByTouch(el);
  }, TOUCH_HOLD_MS);
  hold = { el, x: ev.clientX, y: ev.clientY, timer: at };
}
function onPointerMove(ev: PointerEvent): void {
  if (hold !== null && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > TOUCH_SLOP_PX) {
    cancelHold();
  }
}
/** A finger lifted before the hold ran out: a tap, which shows the hint where it does nothing else. */
function onPointerUp(ev: PointerEvent): void {
  if (ev.pointerType === "mouse") return;
  touchAt = Date.now();
  const tapped = hold === null ? null : hold.el;
  cancelHold();
  if (tapped !== null && !tapped.matches(ACTS_ON_TAP)) showByTouch(tapped);
}
function onClick(ev: MouseEvent): void {
  if (!swallowClick) return;
  swallowClick = false;
  ev.preventDefault();
  ev.stopPropagation();
}
/** Keeps the long-press menu off a control while a hold runs or its hint shows. */
function onContextMenu(ev: Event): void {
  if (hold !== null || (owner !== null && anchor.kind === "touch")) ev.preventDefault();
}

function listen(): void {
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onOut);
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", cancelHold);
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("scroll", hide, true);
}
function unlisten(): void {
  document.removeEventListener("mouseover", onOver);
  document.removeEventListener("mousemove", onMove);
  document.removeEventListener("mouseout", onOut);
  document.removeEventListener("focusin", onFocusIn);
  document.removeEventListener("focusout", onOut);
  document.removeEventListener("mousedown", onDown);
  document.removeEventListener("keydown", onKey);
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  document.removeEventListener("pointercancel", cancelHold);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("contextmenu", onContextMenu);
  window.removeEventListener("scroll", hide, true);
}

function setText(el: Hinted, text: string): void {
  el.dataset.hint = text;
  if (el !== owner) return;
  const b = boxEl();
  b.textContent = text;
  place(el, b);
}

export const vHint: Directive<Hinted, string> = {
  mounted(el, binding) {
    setText(el, binding.value);
    if (users++ === 0) listen();
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) setText(el, binding.value);
  },
  beforeUnmount(el) {
    if (el === owner || el === pending) hide();
    if (hold?.el === el) cancelHold();
    if (--users === 0) {
      unlisten();
      cancelHold();
      box?.remove();
      box = null;
      pressed = false;
      swallowClick = false;
      anchor = { kind: "control" };
      touchAt = Number.NEGATIVE_INFINITY;
    }
  },
};

/** The hint showing now, or null; for tests. */
export function shownHint(): string | null {
  return box === null || box.hidden ? null : box.textContent;
}
