/** Which plate overrides, relative to the digitised travel direction of a PB2002 step. */
export type Overriding = "left" | "right";

/**
 * Bird (2003) names boundaries with the left-hand plate first, as one travels
 * the digitised direction looking down from outside the Earth. Byte 3 is `/`
 * when the right-hand plate subducts under the left-hand one and `\` for the
 * opposite; `-` marks non-subducting boundaries.
 */
export function polarity(title: string): Overriding | null {
  const sep = title.charAt(2);
  if (sep === "/") return "left";
  if (sep === "\\") return "right";
  return null;
}

export interface TeethOptions {
  /** Spacing along the line at zoom 1, viewBox units. */
  spacing?: number;
  /** Tooth height at zoom 1, viewBox units. */
  size?: number;
  /** Steps longer than this are skipped (projection artefacts at the map edge). */
  maxStep?: number;
}

export type ProjectedPoint = [number, number] | null;

const f = (n: number): string => n.toFixed(2);

/**
 * SVG path data for teeth along a projected polyline, apex toward `side`.
 * `null` points break the line. Teeth keep a constant screen size: spacing and
 * height are divided by k^0.75, the same law the markers use.
 */
export function teethPath(
  points: ProjectedPoint[],
  k: number,
  side: Overriding,
  opts: TeethOptions = {},
): string {
  const scale = k ** 0.75;
  const spacing = (opts.spacing ?? 14) / scale;
  const height = (opts.size ?? 6) / scale;
  const half = height * 0.45;
  const maxStep = opts.maxStep ?? 200;
  const sign = side === "left" ? 1 : -1;
  const parts: string[] = [];
  let carry = spacing / 2;
  let prev: ProjectedPoint = null;
  for (const p of points) {
    if (p === null || prev === null) {
      carry = spacing / 2;
      prev = p;
      continue;
    }
    const [x0, y0] = prev;
    const [x1, y1] = p;
    prev = p;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len === 0 || len > maxStep) {
      carry = spacing / 2;
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;
    const nx = sign * uy;
    const ny = -sign * ux;
    let d = carry;
    while (d <= len) {
      const cx = x0 + ux * d;
      const cy = y0 + uy * d;
      parts.push(
        `M${f(cx - ux * half)},${f(cy - uy * half)}L${f(cx + nx * height)},${f(cy + ny * height)}L${f(cx + ux * half)},${f(cy + uy * half)}Z`,
      );
      d += spacing;
    }
    carry = d - len;
  }
  return parts.join("");
}
