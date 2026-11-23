/**
 * Finding a tour step's targets on screen: every element whose `data-tour` (a space-separated
 * list) names one of the step's targets, their boxes joined into one, and where the card docks so
 * it stays clear of them.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How often the targets are looked up again while a tour runs, so the spotlight follows layout. */
export const TRACK_MS = 200;
/** Room around the spotlit box, css pixels. */
export const SPOT_PAD = 6;

/** The elements carrying any of the names; rendered ones only (a box with no size is hidden). */
export function targetElements(names: readonly string[], root: ParentNode = document): Element[] {
  if (names.length === 0) return [];
  const sel = names.map((n) => `[data-tour~="${n}"]`).join(", ");
  return [...root.querySelectorAll(sel)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

/** The union of the elements' boxes, in viewport coordinates; null for none. */
export function unionBox(els: readonly Element[]): Box | null {
  let box: Box | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    box =
      box === null
        ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        : {
            left: Math.min(box.left, r.left),
            top: Math.min(box.top, r.top),
            right: Math.max(box.right, r.right),
            bottom: Math.max(box.bottom, r.bottom),
          };
  }
  return box;
}

export type Dock = "top" | "bottom";

/** The card docks at the bottom when the target sits in the window's upper half, else at the top. */
export function dockOf(box: Box | null, viewportHeight: number): Dock {
  if (box === null) return "bottom";
  return (box.top + box.bottom) / 2 < viewportHeight / 2 ? "bottom" : "top";
}

/** Whether the box lies wholly inside the window. */
export function inView(box: Box, width: number, height: number): boolean {
  return box.top >= 0 && box.left >= 0 && box.bottom <= height && box.right <= width;
}

/** Reads and flips named switches; the runner's default works on the document. */
export interface Switches {
  /** Whether the switch is on; null when nothing carries the name. */
  get: (name: string) => boolean | null;
  /** Clicks the switch's control, as the reader would. */
  set: (name: string, on: boolean) => void;
}

/** The control behind a name: a checkbox, or an element with `aria-expanded`, at or inside it. */
function switchControl(name: string, root: ParentNode): HTMLElement | null {
  const el = root.querySelector(`[data-tour~="${name}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const sel = 'input[type="checkbox"], [aria-expanded]';
  const control = el.matches(sel) ? el : el.querySelector(sel);
  return control instanceof HTMLElement ? control : null;
}

function isOn(control: HTMLElement): boolean {
  return control instanceof HTMLInputElement
    ? control.checked
    : control.getAttribute("aria-expanded") === "true";
}

export function domSwitches(root: ParentNode = document): Switches {
  return {
    get(name) {
      const c = switchControl(name, root);
      return c === null ? null : isOn(c);
    },
    set(name, on) {
      const c = switchControl(name, root);
      if (c !== null && isOn(c) !== on) c.click();
    },
  };
}
