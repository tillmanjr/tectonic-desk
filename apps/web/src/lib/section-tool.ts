import { computed, ref, type ComputedRef, type Ref } from "vue";
import { DEFAULT_HALF_KM, HALF_KM_RANGE, type Section } from "./section.js";

type LonLat = [number, number];
const same = (p: LonLat, q: LonLat): boolean => p[0] === q[0] && p[1] === q[1];

/** The section tool's state: arming, placing two points, dragging an end, and the width control. */
export interface SectionTool {
  armed: Ref<boolean>;
  /** The first point while placing, else null. */
  pending: Ref<LonLat | null>;
  /** The pointer as lon/lat while a line is being placed or dragged; null otherwise. */
  cursor: Ref<LonLat | null>;
  /** What the map draws: the draft while an end is dragged, else the committed section. */
  shown: ComputedRef<Section | null>;
  /** Arms the tool, or disarms it and drops a pending point. */
  toggle(): void;
  cancel(): void;
  /** A click on the map while armed: sets A, then A′ and commits with the default half-width. */
  place(lonLat: LonLat): void;
  hover(lonLat: LonLat | null): void;
  dragStart(end: "a" | "b"): void;
  dragMove(lonLat: LonLat): void;
  /** Commits the draft; a draft whose ends coincide is dropped instead. */
  dragEnd(): void;
  clear(): void;
  /** The corridor half-width, clamped to the allowed range; ignored without a section. */
  setHalfKm(km: number): void;
}

export function useSectionTool(
  section: Readonly<Ref<Section | null>>,
  set: (s: Section | null) => void,
): SectionTool {
  const armed = ref(false);
  const pending = ref<LonLat | null>(null);
  const cursor = ref<LonLat | null>(null);
  const dragging = ref<"a" | "b" | null>(null);
  const draft = ref<Section | null>(null);
  const shown = computed(() => (dragging.value === null ? section.value : draft.value));

  function cancel(): void {
    armed.value = false;
    pending.value = null;
    cursor.value = null;
  }
  return {
    armed,
    pending,
    cursor,
    shown,
    toggle() {
      if (armed.value) cancel();
      else armed.value = true;
    },
    cancel,
    place(lonLat) {
      if (!armed.value) return;
      const first = pending.value;
      if (first === null) {
        pending.value = lonLat;
        return;
      }
      if (same(first, lonLat)) return;
      set({ a: first, b: lonLat, halfKm: DEFAULT_HALF_KM });
      cancel();
    },
    hover(lonLat) {
      cursor.value = armed.value && pending.value !== null ? lonLat : null;
    },
    dragStart(end) {
      if (section.value === null) return;
      dragging.value = end;
      draft.value = section.value;
    },
    dragMove(lonLat) {
      const end = dragging.value;
      const d = draft.value;
      if (end === null || d === null) return;
      draft.value = { ...d, [end]: lonLat };
    },
    dragEnd() {
      const d = draft.value;
      if (dragging.value === null || d === null) return;
      dragging.value = null;
      draft.value = null;
      if (!same(d.a, d.b)) set(d);
    },
    clear() {
      cancel();
      set(null);
    },
    setHalfKm(km) {
      const s = section.value;
      if (s === null) return;
      const [lo, hi] = HALF_KM_RANGE;
      set({ ...s, halfKm: Math.min(hi, Math.max(lo, km)) });
    },
  };
}
