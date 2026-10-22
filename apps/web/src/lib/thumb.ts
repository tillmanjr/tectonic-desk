import type { BBox } from "@tectonic/shared";
import { geoConicConformal, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Basemap } from "./geo.js";
import type { ThumbFrame } from "./marks.js";

/** The thumbnail box, in viewBox units. */
export const THUMB = { width: 96, height: 56 } as const;
const INSET = 2;
const EXTENT: [[number, number], [number, number]] = [
  [INSET, INSET],
  [THUMB.width - INSET, THUMB.height - INSET],
];

/** The projection a thumbnail draws with: the world, or the bbox of the West Coast preset. */
export function thumbProjection(frame: ThumbFrame, bbox: BBox | null): GeoProjection {
  if (frame === "world" || bbox === null) {
    return geoNaturalEarth1().rotate([-150, 0]).fitExtent(EXTENT, { type: "Sphere" });
  }
  const span = bbox.maxLat - bbox.minLat;
  return geoConicConformal()
    .parallels([bbox.minLat + span / 4, bbox.maxLat - span / 4])
    .rotate([-(bbox.minLon + bbox.maxLon) / 2, 0])
    .clipExtent([
      [0, 0],
      [THUMB.width, THUMB.height],
    ])
    .fitExtent(EXTENT, {
      type: "MultiPoint",
      coordinates: [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.minLat],
        [bbox.minLon, bbox.maxLat],
        [bbox.maxLon, bbox.maxLat],
      ],
    });
}

/** The land of a basemap as one SVG path string. */
export function outlinePath(basemap: Basemap, projection: GeoProjection): string {
  return geoPath(projection)(basemap.land) ?? "";
}

/** A five-point star centred on (cx, cy) with outer radius r. */
export function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}
