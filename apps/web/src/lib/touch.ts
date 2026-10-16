/**
 * Touch-screen behaviour of the map: what the zoom behaviour may react to
 * while the map is locked, how large a marker must be to tap, and the hints
 * that tell a finger what the lock means.
 */

/** Number of active touches on an event, 0 for anything that is not a touch event. */
export function touchCount(ev: Event): number {
  const touches: unknown = Reflect.get(ev, "touches");
  if (typeof touches !== "object" || touches === null || !("length" in touches)) return 0;
  return typeof touches.length === "number" ? touches.length : 0;
}

/**
 * Whether d3-zoom may handle `ev`. Unlocked defers to d3's default filter.
 * Locked lets only a two-finger gesture through, so one finger, the wheel and
 * a mouse drag keep scrolling the page while a pinch still works the map.
 */
export function zoomAllowed(locked: boolean, ev: Event, byDefault: () => boolean): boolean {
  if (!locked) return byDefault();
  return touchCount(ev) >= 2;
}

/** Smallest marker radius, in screen pixels, that a finger can hit. */
export const TOUCH_MIN_RADIUS_PX = 7;

/** How long an on-map touch hint stays up. */
export const TOUCH_HINT_MS = 3000;

export const TOUCH_HINTS = {
  oneFingerOnLocked: "Use two fingers to move the map, or tap the lock for one-finger control.",
  locked: "Map locked: one finger scrolls the page, two fingers move the map.",
  unlocked: "Map unlocked: one finger moves the map. Tap the lock to scroll the page again.",
} as const;

/** True on devices whose primary pointer is a finger. */
export function coarsePointer(
  query: (q: string) => { matches: boolean } = (q) => matchMedia(q),
): boolean {
  return query("(pointer: coarse)").matches;
}
