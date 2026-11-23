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
