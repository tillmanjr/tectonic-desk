import { planesOf, type ApiEvent, type ApiMechanism, type ApiRegion } from "@tectonic/shared";

export interface BValue {
  b: number;
  sigma: number;
  n: number;
}

/** Aki (1965) maximum-likelihood b with the Shi & Bolt (1982) uncertainty. */
export function bValue(mags: number[], mc: number): BValue | null {
  const ms = mags.filter((m) => m >= mc - 1e-9);
  const n = ms.length;
  if (n < 2) return null;
  const mean = ms.reduce((a, m) => a + m, 0) / n;
  const b = Math.LOG10E / (mean - (mc - 0.05));
  const ss = ms.reduce((a, m) => a + (m - mean) ** 2, 0);
  return { b, sigma: 2.3 * b * b * Math.sqrt(ss / (n * (n - 1))), n };
}

export interface MagBin {
  m: number;
  cumulative: number;
  incremental: number;
}

/** 0.1-magnitude bins from `mc` to the largest magnitude. */
export function magnitudeBins(mags: number[], mc: number): MagBin[] {
  if (mags.length === 0) return [];
  const max = Math.max(...mags);
  const bins: MagBin[] = [];
  for (let m = mc; m <= max + 1e-9; m += 0.1) {
    const v = Number(m.toFixed(1));
    bins.push({
      m: v,
      cumulative: mags.filter((x) => x >= v - 1e-9).length,
      incremental: mags.filter((x) => Math.abs(x - v) < 0.05).length,
    });
  }
  return bins;
}

const magOf = (e: ApiEvent): number => e.mag ?? -Infinity;
const drawable = (m: ApiMechanism): boolean => planesOf(m) !== null;

/** The solution to draw: preferred mt, preferred fm, then any drawable product. */
export function preferredMechanism(e: ApiEvent): ApiMechanism | null {
  const ms = e.mechanisms.filter(drawable);
  return (
    ms.find((m) => m.kind === "mt" && m.preferred) ??
    ms.find((m) => m.kind === "fm" && m.preferred) ??
    ms[0] ??
    null
  );
}

export function hasSolution(e: ApiEvent): boolean {
  return preferredMechanism(e) !== null;
}

export interface Summary {
  count: number;
  last24h: number;
  largest: ApiEvent | null;
  deepest: ApiEvent | null;
  withSolution: number;
}

export function summary(events: ApiEvent[], now: Date): Summary {
  const dayAgo = now.getTime() - 864e5;
  let largest: { e: ApiEvent; mag: number } | null = null;
  let deepest: { e: ApiEvent; km: number } | null = null;
  let last24h = 0;
  let withSolution = 0;
  for (const e of events) {
    if (Date.parse(e.time) >= dayAgo) last24h += 1;
    if (hasSolution(e)) withSolution += 1;
    if (e.mag !== null && (largest === null || e.mag > largest.mag)) largest = { e, mag: e.mag };
    if (e.depthKm !== null && (deepest === null || e.depthKm > deepest.km)) {
      deepest = { e, km: e.depthKm };
    }
  }
  return {
    count: events.length,
    last24h,
    largest: largest?.e ?? null,
    deepest: deepest?.e ?? null,
    withSolution,
  };
}

const byMagDesc = (a: ApiEvent, b: ApiEvent): number => magOf(b) - magOf(a);

export function majorEvents(events: ApiEvent[], region: ApiRegion): ApiEvent[] {
  if (region.id === "global") {
    return events.filter((e) => magOf(e) >= 6 || e.alert !== null).sort(byMagDesc);
  }
  return [...events].sort(byMagDesc).slice(0, 4);
}

export function majorLabel(region: ApiRegion): string {
  return region.id === "global"
    ? "Major events · M6+ or a PAGER alert"
    : "Largest events in the region";
}
