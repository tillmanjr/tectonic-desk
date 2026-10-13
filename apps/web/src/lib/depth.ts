export type DepthClass = "shallow" | "intermediate" | "deep" | "unknown";

export function depthClass(km: number | null): DepthClass {
  if (km === null) return "unknown";
  if (km < 70) return "shallow";
  if (km < 300) return "intermediate";
  return "deep";
}

export const DEPTH_LABEL: Record<DepthClass, string> = {
  shallow: "shallow (<70 km)",
  intermediate: "intermediate (70–300 km)",
  deep: "deep (≥300 km)",
  unknown: "depth not reported",
};

const DEPTH_VAR: Record<DepthClass, string> = {
  shallow: "--shallow",
  intermediate: "--inter",
  deep: "--deep",
  unknown: "--muted",
};

/** The CSS custom property name carrying this depth's colour. */
export function depthVar(km: number | null): string {
  return DEPTH_VAR[depthClass(km)];
}

/** A CSS colour value usable in inline styles. */
export function depthColor(km: number | null): string {
  return `var(${depthVar(km)})`;
}
