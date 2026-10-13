import { vi } from "vitest";

export interface Fake2d {
  data: Uint8ClampedArray;
  texts: string[];
  arcs: number;
  renders: number;
}

/** Replaces the canvas 2D context so beachballs rasterise under happy-dom. */
export function stubCanvas(): Fake2d {
  const state: Fake2d = { data: new Uint8ClampedArray(0), texts: [], arcs: 0, renders: 0 };
  const ctx = {
    createImageData: (w: number, h: number) => {
      state.data = new Uint8ClampedArray(w * h * 4);
      return { data: state.data };
    },
    putImageData: () => undefined,
    beginPath: () => undefined,
    arc: () => {
      state.arcs += 1;
    },
    stroke: () => undefined,
    fill: () => undefined,
    fillText: (t: string) => {
      state.texts.push(t);
    },
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
    state.renders += 1;
    return `data:${String(state.renders)}`;
  });
  return state;
}
