import { geoAzimuthalEqualArea, geoCircle, geoGraticule, type GeoProjection } from "d3-geo";
import type { MultiLineString, Polygon } from "geojson";

/**
 * The polar maps: an azimuthal equal-area view about each pole with the subsolar meridian at
 * the top, so noon is up and the night side is always the lower half, clipped at 40° latitude.
 */

export type Hemisphere = "north" | "south";
/** The square viewBox the maps are drawn in. */
export const MAP_SIZE = 400;
/** The map's rim, degrees of latitude from the pole. */
const RIM = 50;

export function polarProjection(
  hemisphere: Hemisphere,
  subsolarLon: number,
  size = MAP_SIZE,
): GeoProjection {
  // Rotating the pole to the centre puts the meridian opposite the rotation at the top for the
  // north (the view looks down on it) and the meridian itself at the top for the south.
  const rotate: [number, number] =
    hemisphere === "north" ? [180 - subsolarLon, -90] : [-subsolarLon, 90];
  return geoAzimuthalEqualArea()
    .rotate(rotate)
    .clipAngle(RIM)
    .fitSize([size, size], { type: "Sphere" });
}

/** The half of the sphere in darkness: a 90° circle about the antisolar point. */
export function nightRing([lon, lat]: [number, number]): Polygon {
  return geoCircle()
    .center([lon + 180, -lat])
    .radius(90)();
}

/** Parallels every 10° and meridians every 30°; the projection clips them to the rim. */
export function polarGraticule(): MultiLineString {
  return geoGraticule().step([30, 10])();
}

export interface TimeMark {
  label: string;
  side: "top" | "bottom" | "left" | "right";
}

/**
 * Local solar time around the rim. Noon is up and midnight down on both maps; the north,
 * seen from above, turns anticlockwise so morning is on the right, and the south the reverse.
 */
export function timeMarks(hemisphere: Hemisphere): TimeMark[] {
  const morning = hemisphere === "north" ? "right" : "left";
  const evening = hemisphere === "north" ? "left" : "right";
  return [
    { label: "12", side: "top" },
    { label: "00", side: "bottom" },
    { label: "06", side: morning },
    { label: "18", side: evening },
  ];
}
