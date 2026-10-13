import type { NodalPlane } from "./planes.js";

/**
 * Faulting style from the rake of a nodal plane, with the prototype's
 * thresholds: reverse 30..150, normal −150..−30, otherwise strike-slip;
 * "Thrust" for a reverse plane dipping 35° or less; "Oblique" when the rake
 * sits between the pure cases.
 */
export function faultingStyle(p: NodalPlane): string {
  const r = p.rake;
  const a = Math.abs(r);
  let style: string;
  if (r >= 30 && r <= 150) style = "Reverse";
  else if (r <= -30 && r >= -150) style = "Normal";
  else style = "Strike-slip";
  const oblique = (a > 20 && a < 70) || (a > 110 && a < 160);
  if (style === "Reverse" && p.dip <= 35 && !oblique) style = "Thrust";
  return (oblique ? "Oblique " : "") + style;
}

/** Sense of slip on a strike-slip plane. */
export function strikeSlipSense(p: NodalPlane): "left-lateral" | "right-lateral" {
  return Math.abs(p.rake) < 90 ? "left-lateral" : "right-lateral";
}
