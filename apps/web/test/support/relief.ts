import type { ApiRelief } from "@tectonic/shared";

/** A relief response built from a function of the sample index, `n` samples at `stepKm`. */
export function reliefOf(n: number, stepKm: number, metres: (i: number) => number): ApiRelief {
  return { stepKm, metres: Array.from({ length: n }, (_, i) => metres(i)) };
}

/** 256 samples of flat sea floor at −3000 m, 1 km apart: the fake API's default. */
export const FLAT_RELIEF: ApiRelief = reliefOf(256, 1, () => -3000);
