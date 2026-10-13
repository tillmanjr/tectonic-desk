import type { ApiRegion } from "@tectonic/shared";

/** The two prototype views. User-defined regions will join this list later. */
export const REGIONS: readonly ApiRegion[] = [
  {
    id: "global",
    name: "Global",
    subtitle: "M4.5+ · past 7 days",
    minMag: 4.5,
    days: 7,
    bbox: null,
  },
  {
    id: "wc",
    name: "West Coast US",
    subtitle: "M2.5+ · past 30 days",
    minMag: 2.5,
    days: 30,
    bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
  },
];
