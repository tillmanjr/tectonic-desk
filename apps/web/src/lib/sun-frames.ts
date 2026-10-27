import { SUN_FRAMES, type SunKey } from "@tectonic/shared";

/** The frame `delta` places along the strip from `key`, wrapping at the ends; an unknown key stays. */
export function stepKey(key: SunKey, delta: number): SunKey {
  const order = SUN_FRAMES.map((f) => f.key);
  const j = order.indexOf(key);
  const target = order[(j + delta + order.length) % order.length];
  return j === -1 || target === undefined ? key : target;
}
