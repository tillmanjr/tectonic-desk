import { DEFAULT_HALF_KM, type Section } from "./section.js";
import type { MapView } from "./mapview.js";
import type { Tour } from "./tour.js";

/**
 * The tours' content. Steps reach the app only through `data-tour` names and the stage, and a
 * test walks every step against the mounted app, so a renamed or removed control fails the build.
 */

type LonLat = [number, number];

/** Example lines: across the Japan Trench, and across the Mendocino triple junction. */
export const EXAMPLE_SECTIONS: Record<"global" | "regional", Section> = {
  global: { a: [145, 38.3], b: [136.5, 38.3], halfKm: DEFAULT_HALF_KM },
  regional: { a: [-126.5, 40.3], b: [-121.5, 40.3], halfKm: DEFAULT_HALF_KM },
};

/** Example measurements: Tokyo to San Francisco, Seattle to Los Angeles. */
export const EXAMPLE_MEASURES: Record<"global" | "regional", [LonLat, LonLat]> = {
  global: [
    [139.69, 35.69],
    [-122.42, 37.77],
  ],
  regional: [
    [-122.33, 47.61],
    [-118.24, 34.05],
  ],
};

const scale = (mv: MapView): "global" | "regional" =>
  mv.view.value.frame.global ? "global" : "regional";

export const ORIENTATION: Tour = {
  id: "orientation",
  title: "Orientation",
  blurb: "The parts of the app, in about two minutes.",
  pageFor: () => "active",
  steps: [
    {
      id: "welcome",
      title: "Tectonic Desk",
      body: "Earthquakes, volcanoes and space weather, read from the agencies that publish them and kept in this site's own history. This tour runs on the Active Earth page, which shows earthquakes and volcanoes together; your own view comes back when it ends.",
      targets: [],
    },
    {
      id: "pages",
      title: "Pages",
      body: "Active Earth combines both datasets; Earthquakes and Volcanoes give each its own page with more room for its tables and charts; Space covers the Sun, the solar wind, geomagnetic indices and the aurora.",
      targets: ["pages"],
    },
    {
      id: "regions",
      title: "Regions",
      body: "Global, or the West Coast at a lower magnitude floor with the USGS Quaternary faults. The region, the selection and the filters live in the address, so a copied link reopens this exact view.",
      targets: ["regions"],
    },
    {
      id: "status",
      title: "Status",
      body: "When this site last synced the USGS ComCat feed, and how long ago. It turns amber when the sync is overdue and red when the site's own server cannot be reached.",
      targets: ["status"],
    },
    {
      id: "summary",
      title: "Summaries",
      body: "The window at a glance: the event count, the largest and deepest events and how many carry a mechanism; for volcanoes, USGS elevated alerts, GeoNet unrest and continuing eruptions. The cards below list the largest events and the volcanoes of note.",
      targets: ["summary"],
    },
    {
      id: "refine",
      title: "Refine",
      body: "Each dataset has its own refine bar: the window (back to 1900), magnitude and depth for earthquakes; setting, type, last eruption and status for volcanoes. Click a bar's head to open it; collapsed, it summarises what is in force, and it says when a change is still loading.",
      targets: ["refine"],
    },
    {
      id: "map",
      title: "The map",
      body: "Epicentres sized by magnitude and coloured by depth class, Holocene volcanoes by status, over the PB2002 plate boundaries. Hover anything for its readout; click an event or a volcano to open it. The Map tools tour covers the toolbar.",
      targets: ["map"],
    },
    {
      id: "detail",
      title: "Detail",
      body: "The selected event: origin, depth, the mechanism with both nodal planes and its axes, impact (DYFI, ShakeMap, PAGER), the sequence around it and the catalogue record, with a link to the USGS event page. This is the largest event in the window.",
      targets: ["detail"],
      enter: (ctx) => {
        ctx.selectLargest();
      },
      leave: (ctx) => {
        ctx.clearSelection();
      },
    },
    {
      id: "analysis",
      title: "Catalogue and charts",
      body: "The catalogue table sorts and filters by column, independently of the refine bar; the charts give magnitude through time (with the completeness breaks of 1964, 1973 and 1976), the frequency–magnitude distribution and depth. Volcano tables and charts follow further down.",
      targets: ["analysis"],
    },
    {
      id: "marks",
      title: "Marks",
      body: "Mark an event or a volcano from its panel to keep it, in groups of your own. Marks open as stacked panels or as a pairwise comparison, and export to a file. They are kept in this browser.",
      targets: ["marks"],
    },
    {
      id: "settings",
      title: "Settings",
      body: "UTC or your browser's time zone for every date and time, and a light or dark theme.",
      targets: ["settings"],
    },
    {
      id: "help",
      title: "Help",
      body: "The tours live here. Start another, pick up one you left, or jump to any step. Next: the Map tools tour.",
      targets: ["help"],
    },
  ],
};

export const MAP_TOOLS: Tour = {
  id: "map",
  title: "Map tools",
  blurb: "Layers, fields, sections, measuring, your pin and theater mode.",
  pageFor: (p) => (p === "space" ? "active" : p),
  steps: [
    {
      id: "toolbar",
      title: "The toolbar",
      body: "Everything that changes what the map draws, or what you can do on it, sits on this bar. Each control explains itself when you rest the pointer on it (or hold a finger on it) for a second.",
      targets: ["map.tools"],
    },
    {
      id: "lock",
      title: "The lock",
      body: "The map starts locked, so the wheel and a drag scroll the page past it. Unlock to pan and zoom by hand; on a touch screen two fingers move a locked map.",
      targets: ["map.lock"],
    },
    {
      id: "zoom",
      title: "Zoom",
      body: "Zoom on the map's centre, or reset to the whole region. Markers grow more slowly than the map, so clusters separate as you zoom in.",
      targets: ["map.zoom"],
    },
    {
      id: "layers",
      title: "Reference layers",
      body: "PB2002 plate boundaries coloured by class, teeth on the overriding plate along subduction zones, and the OVATION aurora forecast on the night side. In the West Coast view the Quaternary faults join them, by age of last deformation.",
      targets: ["map.layers"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        if (mv === null) return;
        mv.showPlates.value = true;
        mv.showTeeth.value = true;
      },
    },
    {
      id: "page",
      title: "Earthquake layers",
      body: "Beachballs in place of dots for events with a mechanism, the selected event's ShakeMap intensity, density shading when a long window raises the floor, and Animate to replay the window.",
      targets: ["map.page"],
    },
    {
      id: "field",
      title: "Fields",
      body: "A potential-field anomaly under everything: free-air gravity (isostatic residual onshore in the West Coast view) or the EMAG2v3 magnetic anomaly. Gravity is on now; the legend gives the source and the ramp.",
      targets: ["map.field", "map.stage"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        if (mv !== null) mv.field.value = "gravity";
      },
      leave: async (ctx) => {
        const mv = await ctx.map();
        if (mv !== null) mv.field.value = "none";
      },
    },
    {
      id: "section",
      title: "Cross-section",
      body: "Click two points to draw a section line; the events within its corridor plot at true scale under the map, with the relief along the line. Here, a line across the subduction zone, zoomed in.",
      tryIt: "Drag either end of the line and watch the profile follow.",
      targets: ["map.section", "map.stage"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        if (mv === null) return;
        const s = EXAMPLE_SECTIONS[scale(mv)];
        ctx.setSection(s);
        mv.zoomTo((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
      },
      leave: async (ctx) => {
        ctx.setSection(null);
        const mv = await ctx.map();
        mv?.reset();
      },
    },
    {
      id: "measure",
      title: "Measure",
      body: "The angular distance and the great-circle distance between two points, and the chord straight through the Earth with how deep it dips and which PREM layer it reaches.",
      tryIt: "Drag either end; Measure again clears it.",
      targets: ["map.measure", "map.stage"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        if (mv === null) return;
        const [a, b] = EXAMPLE_MEASURES[scale(mv)];
        mv.measure.clear();
        mv.measure.toggle();
        mv.measure.place(a);
        mv.measure.place(b);
      },
      leave: async (ctx) => {
        const mv = await ctx.map();
        mv?.measure.clear();
      },
    },
    {
      id: "pin",
      title: "Your pin",
      body: "One pin of your own per map view, named if you like and kept in this browser, with the last 24 placements under Recent. Hold the pin for a moment to lift and move it.",
      tryIt: "Click the map to drop the pin.",
      targets: ["map.pin", "map.pinbar", "map.stage"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        if (mv !== null && !mv.pin.open.value) mv.pin.toggle();
      },
      leave: async (ctx) => {
        const mv = await ctx.map();
        if (mv?.pin.open.value === true) mv.pin.toggle();
      },
    },
    {
      id: "theater",
      title: "Theater mode",
      body: "The map and its toolbar fill the window, cropping the map on its long side; it unlocks while in theater, so drag to see the rest. This button or Esc brings the page back.",
      targets: ["map.theater"],
    },
    {
      id: "legend",
      title: "Legend",
      body: "The depth classes, the magnitude sizes at the floor in force, and a row for each layer that is on.",
      targets: ["map.legend"],
    },
    {
      id: "done",
      title: "That's the map",
      body: "Every step of this tour stays in the Help menu, should you want one again.",
      targets: ["help"],
    },
  ],
};

export const TOURS: readonly Tour[] = [ORIENTATION, MAP_TOOLS];
