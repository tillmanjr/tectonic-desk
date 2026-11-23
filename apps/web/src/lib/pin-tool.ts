import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { Pin, PinsStore, PinView } from "./pins.js";

type LonLat = [number, number];

/** How long a press on the pin must hold still before the pin lifts and follows the pointer. */
export const PIN_HOLD_MS = 450;
/** How far, in screen pixels, a press may wander before the hold is given up. */
export const PIN_SLOP_PX = 4;

/**
 * The pin tool for one map: the bar, arming a placement, and moving the pin.
 * A quick press on the pin opens the bar; only a press held still for
 * `PIN_HOLD_MS` lifts it, so a stray drag never moves it by accident.
 */
export interface PinTool {
  /** The view's pin, or null. */
  pin: ComputedRef<Pin | null>;
  /** Whether the pin bar is shown. */
  open: Ref<boolean>;
  /** Waiting for a click on the map to place the pin. */
  armed: Ref<boolean>;
  /** The pointer as lon/lat while armed or while the pin is lifted; null otherwise. */
  cursor: Ref<LonLat | null>;
  /** A press on the pin is waiting out the hold. */
  holding: Ref<boolean>;
  /** The pin follows the pointer. */
  lifted: Ref<boolean>;
  /** Where the map draws the pin: under the pointer while lifted, else where it is. */
  shown: ComputedRef<LonLat | null>;
  /** Opens the bar (arming when the view has no pin) or closes it and cancels a placement. */
  toggle(): void;
  arm(): void;
  /** Stops arming and drops a lifted pin back where it was. */
  cancel(): void;
  /** A click on the map while armed: places the pin, replacing the view's. */
  place(lonLat: LonLat): void;
  hover(lonLat: LonLat | null): void;
  /** A press on the pin, at screen coordinates. */
  press(at: [number, number]): void;
  /** The pointer moved during a press; `lonLat` is under it, null off the map. */
  pressMove(at: [number, number], lonLat: LonLat | null): void;
  /** The press ended: a lifted pin is set down, a quick press opens the bar. */
  release(): void;
  rename(name: string): void;
  remove(): void;
}

export function usePinTool(pins: PinsStore, view: () => PinView): PinTool {
  const pin = computed(() => pins.doc.value.current[view()]);
  const open = ref(false);
  const armed = ref(false);
  const cursor = ref<LonLat | null>(null);
  const holding = ref(false);
  const lifted = ref(false);
  let pressAt: [number, number] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const shown = computed<LonLat | null>(() => {
    if (lifted.value && cursor.value !== null) return cursor.value;
    const p = pin.value;
    return p === null ? null : [p.lon, p.lat];
  });

  function stopHold(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    holding.value = false;
  }
  function cancel(): void {
    stopHold();
    armed.value = false;
    lifted.value = false;
    cursor.value = null;
    pressAt = null;
  }
  return {
    pin,
    open,
    armed,
    cursor,
    holding,
    lifted,
    shown,
    toggle() {
      if (open.value) {
        open.value = false;
        cancel();
        return;
      }
      open.value = true;
      if (pin.value === null) armed.value = true;
    },
    arm() {
      cancel();
      open.value = true;
      armed.value = true;
    },
    cancel,
    place(lonLat) {
      if (!armed.value) return;
      pins.place(view(), lonLat);
      cancel();
    },
    hover(lonLat) {
      if (armed.value) cursor.value = lonLat;
    },
    press(at) {
      if (pin.value === null || armed.value) return;
      stopHold();
      pressAt = at;
      holding.value = true;
      timer = setTimeout(() => {
        timer = null;
        holding.value = false;
        lifted.value = true;
      }, PIN_HOLD_MS);
    },
    pressMove(at, lonLat) {
      if (lifted.value) {
        if (lonLat !== null) cursor.value = lonLat;
        return;
      }
      if (pressAt !== null && Math.hypot(at[0] - pressAt[0], at[1] - pressAt[1]) > PIN_SLOP_PX) {
        stopHold();
        pressAt = null;
      }
    },
    release() {
      const wasHolding = holding.value;
      const to = lifted.value ? cursor.value : null;
      cancel();
      if (to !== null) pins.move(view(), to);
      else if (wasHolding) open.value = true;
    },
    rename(name) {
      pins.rename(view(), name);
    },
    remove() {
      cancel();
      pins.remove(view());
    },
  };
}
