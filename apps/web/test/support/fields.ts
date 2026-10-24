import type { FieldRaster, FieldsFile } from "@tectonic/shared";

export function raster(over: Partial<FieldRaster> = {}): FieldRaster {
  return {
    field: "gravity",
    view: "global",
    src: "/fields/gravity-global.png",
    width: 1536,
    height: 799,
    units: "mGal",
    stops: [
      [-120, "#2f5f9e"],
      [-60, "#8db0d6"],
      [0, "#efeee9"],
      [60, "#dc9a84"],
      [120, "#a63d2f"],
    ],
    ticks: [-120, -60, 0, 60, 120],
    equalised: false,
    caption: "Free-air gravity anomaly · test",
    source: { name: "test", url: "https://example.test/", doi: null },
    ...over,
  };
}

/** Gravity for both views and magnetic for the global view only. */
export const fieldsFile: FieldsFile = {
  generated: "2026-10-24T00:00:00.000Z",
  rasters: [
    raster(),
    raster({ view: "wc", src: "/fields/gravity-wc.png", width: 2048, height: 1434 }),
    raster({
      field: "magnetic",
      src: "/fields/magnetic-global.png",
      units: "nT",
      stops: [
        [-300, "#2f5f9e"],
        [-40, "#8db0d6"],
        [0, "#efeee9"],
        [40, "#dc9a84"],
        [300, "#a63d2f"],
      ],
      ticks: [-300, -40, 0, 40, 300],
      equalised: true,
      caption: "Total-field magnetic anomaly · test",
    }),
  ],
};
