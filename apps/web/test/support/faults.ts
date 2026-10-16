import type { Topo } from "../../src/lib/geo.js";

/** Three Bay Area traces in the shape of `wc-qfaults.json`, plus a point and a malformed property bag. */
export const faultsTopology: Topo = {
  type: "Topology",
  arcs: [
    [
      [-122.1, 37.6],
      [-122.0, 37.5],
    ],
    [
      [-121.9, 37.4],
      [-121.8, 37.3],
    ],
    [
      [-120, 36],
      [-119, 35],
    ],
  ],
  objects: {
    faults: {
      type: "GeometryCollection",
      geometries: [
        {
          type: "MultiLineString",
          arcs: [[0]],
          properties: {
            id: "55-c",
            name: "Hayward fault zone",
            section: "Southern Hayward section",
            age: "historic",
            cert: "well",
            rate: "Between 1.0 and 5.0 mm/yr",
            sense: "Right lateral",
            dip: "Vertical",
          },
        },
        {
          type: "LineString",
          arcs: [1],
          properties: {
            id: "238",
            name: "Pleasanton fault",
            section: null,
            age: "latest",
            cert: "mod",
            rate: null,
            sense: null,
            dip: "NE",
          },
        },
        { type: "Point", coordinates: [-121, 36], properties: { name: "not a line" } },
        { type: "MultiLineString", arcs: [[2]], properties: { age: "bogus", cert: 7, name: 3 } },
      ],
    },
  },
};
