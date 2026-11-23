import { DEFAULT_HALF_KM, type Section } from "./section.js";
import type { MapView } from "./mapview.js";
import type { StepContext, Tour } from "./tour.js";

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

/** Draws the example section for the map's scale and zooms to it. */
async function showSection(ctx: StepContext): Promise<void> {
  const mv = await ctx.map();
  if (mv === null) return;
  const s = EXAMPLE_SECTIONS[scale(mv)];
  ctx.setSection(s);
  mv.zoomTo((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
}
async function hideSection(ctx: StepContext): Promise<void> {
  ctx.setSection(null);
  const mv = await ctx.map();
  mv?.reset();
}
/** Opens the largest event with a mechanism, for the steps that read its panel or its ShakeMap. */
function selectExample(ctx: StepContext): void {
  ctx.selectLargest({ mechanism: true });
}

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
      enter: showSection,
      leave: hideSection,
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

export const EARTHQUAKES: Tour = {
  id: "earthquakes",
  title: "Earthquakes",
  blurb: "The window, an event in depth, its ShakeMap, the profile, the table and the charts.",
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "The Earthquakes page",
      body: "The catalogue on its own, with room for the table and the charts. Everything on it reads one window of the USGS ComCat catalogue, refined below; this tour opens an event and walks from the map down to the statistics.",
      targets: [],
    },
    {
      id: "summary",
      title: "Summary",
      body: "The preset window at a glance: the event count and how many fell in the last 24 hours, the largest and the deepest, and how many carry a moment tensor or focal mechanism.",
      targets: ["summary"],
    },
    {
      id: "cards",
      title: "Major events",
      body: "Globally, every M6+ event or one with a PAGER alert; on the West Coast, the four largest. Each card shows the mechanism when there is one, the PAGER and tsunami flags, and what followed within 150 km. Click a card to open the event; the link beside the label shows the rest.",
      targets: ["quakes.cards"],
    },
    {
      id: "refine",
      title: "Refine",
      body: "The window runs from 30 days to the whole catalogue since 1900, or between any two dates; magnitude and depth narrow it further. A long window raises the marker floor so the page stays responsive, and says so here; the time chart still counts every event, and the map's Density toggle shades where the rest fall.",
      targets: ["refine.earthquakes"],
      enter: (ctx) => {
        ctx.setSwitch("refine.earthquakes", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("refine.earthquakes", false);
      },
    },
    {
      id: "detail",
      title: "An event",
      body: "The largest event in the window with a mechanism: origin time in UTC and your zone, epicentre, depth and its class, and the event id. Pick any event from the map, a card or the table to open it here.",
      targets: ["detail"],
      enter: selectExample,
    },
    {
      id: "mechanism",
      title: "Mechanism",
      body: "The preferred moment tensor or first-motion solution as a lower-hemisphere, equal-area beachball with the T and P axes, both nodal planes (strike / dip / rake) and the faulting style. A low double-couple percentage is flagged, and planes rebuilt from the P and T axes say so. Other agencies' solutions follow.",
      targets: ["detail.mechanism"],
      enter: selectExample,
    },
    {
      id: "impact",
      title: "Impact and sequence",
      body: "Significance, Did You Feel It? reports and maximum intensity, the ShakeMap maximum MMI, the PAGER alert and the tsunami flag; then the events that followed within 150 km, or the larger event this one followed.",
      targets: ["detail.impact"],
      enter: selectExample,
    },
    {
      id: "shakemap",
      title: "ShakeMap",
      body: "The selected event's USGS ShakeMap as Modified Mercalli intensity bands, from ground-motion models with site amplification and constrained by stations and felt reports. Point at a band for its intensity; the legend gives the scale. USGS publishes one for most M5.5+ events.",
      targets: ["map.shake", "map.stage"],
      enter: (ctx) => {
        selectExample(ctx);
        ctx.setSwitch("map.shake", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("map.shake", false);
      },
    },
    {
      id: "mechanisms",
      title: "Mechanisms on the map",
      body: "Every event with a solution drawn as its beachball in place of the dot, so the faulting style along a boundary reads at a glance. Off by default; it crowds a busy window.",
      targets: ["map.mech", "map.stage"],
      enter: (ctx) => {
        ctx.setSwitch("map.mech", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("map.mech", false);
      },
    },
    {
      id: "profile",
      title: "Cross-section profile",
      body: "With a section line on the map, the events within its corridor plot here against distance along the line and depth, at true scale, over the relief along it. Exaggerate the vertical ×2 or ×4, widen or narrow the corridor, or clear the line from the title.",
      tryIt: "Drag an end of the line on the map; the profile follows.",
      targets: ["section.profile"],
      enter: showSection,
      leave: hideSection,
    },
    {
      id: "table",
      title: "Catalogue",
      body: "Every event in the window. Click a heading to sort, open a column's filter for a range or a text match (independent of the refine bar, and cleared when the region changes), and click a row to open the event.",
      targets: ["quakes.table"],
    },
    {
      id: "magtime",
      title: "Magnitude through time",
      body: "Each event against its origin time, with the completeness breaks of 1964, 1973 and 1976 marked when the window reaches back that far. When the floor is raised it switches to per-bin counts and maxima, so the whole window still shows.",
      targets: ["chart.magtime"],
    },
    {
      id: "fm",
      title: "Frequency–magnitude",
      body: "Cumulative N(≥M) over incremental counts, with b from the Aki (1965) maximum-likelihood estimator and the Shi & Bolt (1982) uncertainty above Mc. Magnitude types are mixed and sequences are not declustered, so read it as descriptive.",
      targets: ["chart.fm"],
    },
    {
      id: "depth",
      title: "Depth distribution",
      body: "Depth against magnitude, with the 70 and 300 km boundaries between the shallow, intermediate and deep classes; the West Coast view stops at 35 km, where its seismicity is crustal.",
      targets: ["chart.depth"],
    },
    {
      id: "mark",
      title: "Mark it",
      body: "Keep the event in your marks, in a group of your own, to reopen it later, stack it beside others or compare them pairwise.",
      targets: ["detail.mark"],
      enter: selectExample,
    },
    {
      id: "done",
      title: "That's the catalogue",
      body: "Every step of this tour stays in the Help menu.",
      targets: ["help"],
    },
  ],
};

export const TOURS: readonly Tour[] = [ORIENTATION, MAP_TOOLS, EARTHQUAKES];
