export interface Tick {
  pos: number;
  label: string;
}

/** The subset of a d3 continuous scale that axes need. */
export interface AxisScale<T> {
  (value: T): number;
  ticks(count?: number): T[];
  tickFormat(count?: number, specifier?: string): (value: T) => string;
}

export function ticksOf<T>(scale: AxisScale<T>, count: number, specifier?: string): Tick[] {
  const format = scale.tickFormat(count, specifier);
  return scale.ticks(count).map((v) => ({ pos: scale(v), label: format(v) }));
}

/** SVG path data for a step-after line through the points. */
export function stepPath(points: { x: number; y: number }[]): string {
  return points
    .map((p, i) => (i === 0 ? `M${String(p.x)},${String(p.y)}` : `H${String(p.x)}V${String(p.y)}`))
    .join("");
}
