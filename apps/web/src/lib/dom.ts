import type { Ref } from "vue";

/** A template ref that must be mounted by the time it is read. */
export function mustRef<T>(r: Ref<T | null>, what: string): T {
  if (r.value === null) throw new Error(`${what} is not mounted`);
  return r.value;
}

/** Routes the rest of a drag to the element under the pointer at its start, when it is an element. */
export function capturePointer(ev: PointerEvent): void {
  const t = ev.currentTarget;
  if (t instanceof Element) t.setPointerCapture(ev.pointerId);
}
