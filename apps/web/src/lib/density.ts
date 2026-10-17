import type { ApiEventGrid } from "@tectonic/shared";
import { scaleLog } from "d3-scale";
import type { Polygon } from "geojson";

const LOW = 0.08;
const HIGH = 0.75;

/** Fill opacities of the legend ramp, lightest to darkest; the layer interpolates between the ends. */
export const DENSITY_RAMP: readonly number[] = [LOW, 0.25, 0.42, 0.58, HIGH];

/** Opacity for a cell count, log-scaled from 1 to the grid's largest count. */
export function densityOpacity(max: number): (count: number) => number {
  if (max <= 1) return () => HIGH;
  const s = scaleLog().domain([1, max]).range([LOW, HIGH]).clamp(true);
  return (count) => s(count);
}

/** A cell as a clockwise spherical ring from its south-west corner, as d3-geo expects for small polygons. */
export function cellRing(lat: number, lon: number, cell: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon, lat + cell],
        [lon + cell, lat + cell],
        [lon + cell, lat],
        [lon, lat],
      ],
    ],
  };
}

export interface DensityLegend {
  cell: number;
  floor: number;
  max: number;
}

export function densityLegendFor(grid: ApiEventGrid, floor: number): DensityLegend {
  return { cell: grid.cell, floor, max: Math.max(1, ...grid.cells.map((c) => c.count)) };
}
