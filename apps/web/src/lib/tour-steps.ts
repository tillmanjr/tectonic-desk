import { zoomIdentity } from "d3-zoom";
import { DEFAULT_HALF_KM, type Section } from "./section.js";
import type { MapView } from "./mapview.js";
import type { MarkDraft } from "./marks.js";
import type { StepContext, Tour } from "./tour.js";

/**
 * The tours' content, and the examples and helpers the deep dives under `deep/` share. Steps reach
 * the app only through `data-tour` names and the stage, and a test walks every step against the
 * mounted app, so a renamed or removed control fails the build. `tour-catalog.ts` lists them all.
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
export async function showSection(ctx: StepContext): Promise<void> {
  const mv = await ctx.map();
  if (mv === null) return;
  const s = EXAMPLE_SECTIONS[scale(mv)];
  ctx.setSection(s);
  mv.zoomTo((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
}
export async function hideSection(ctx: StepContext): Promise<void> {
  ctx.setSection(null);
  const mv = await ctx.map();
  mv?.reset();
}
/**
 * The event the Earthquakes tour reads: the M6.2 of 20 December 2021, 7 km N of Petrolia, at the
 * Mendocino triple junction, with a moment tensor, a reviewed ShakeMap, DYFI and a PAGER alert.
 * The window is its first month, on the West Coast map, so its aftershocks show around it.
 */
export const EXAMPLE_EVENT = {
  id: "nc73666231",
  /** The event's first month on the West Coast map, with nothing selected. */
  window: "/earthquakes/wc?since=2021-12-20&until=2022-01-19",
  url: "/earthquakes/wc?since=2021-12-20&until=2022-01-19&event=nc73666231",
};
/**
 * The volcano the Volcanoes tour reads: Kīlauea, with a USGS status history and its notices, a
 * long GVP eruption record and a continuing eruption. Selecting it zooms the map to it.
 */
export const EXAMPLE_VOLCANO = { number: 332010, url: "/volcanoes/global?volcano=332010" };
async function showVolcano(ctx: StepContext): Promise<void> {
  await ctx.go(EXAMPLE_VOLCANO.url);
}

/** Opens the example event in its window; selecting it zooms the map to it. */
export async function showExample(ctx: StepContext): Promise<void> {
  await ctx.go(EXAMPLE_EVENT.url);
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
      detour: { tour: "map-nav", label: "The header and getting around the map, in detail" },
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
      detour: { tour: "map-layers", label: "Every layer and the legend, in detail" },
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
      detour: { tour: "map-animate", label: "Replaying the window, in detail" },
    },
    {
      id: "field",
      title: "Fields",
      body: "A potential-field anomaly under everything: free-air gravity (isostatic residual onshore in the West Coast view) or the EMAG2v3 magnetic anomaly. Gravity is on now; the legend gives the source and the ramp.",
      targets: ["map.field", "map.stage"],
      detour: { tour: "map-fields", label: "The fields and their sources, in detail" },
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
      detour: { tour: "map-section", label: "Cross-sections and the profile, in detail" },
      enter: showSection,
      leave: hideSection,
    },
    {
      id: "measure",
      title: "Measure",
      body: "The angular distance and the great-circle distance between two points, and the chord straight through the Earth with how deep it dips and which PREM layer it reaches.",
      tryIt: "Drag either end; Measure again clears it.",
      targets: ["map.measure", "map.stage"],
      detour: { tour: "map-measure", label: "Measuring, in detail" },
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
      detour: { tour: "map-pin", label: "Your pin, in detail" },
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
      body: "The catalogue on its own, with room for the table and the charts. Everything on it reads one window of the USGS ComCat catalogue, refined below. Partway through, this tour opens a well-recorded event on the West Coast and walks from its panel and map down to the statistics.",
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
      detour: { tour: "refine-quakes", label: "Every control of this bar, in detail" },
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
      body: "The M6.2 of 20 December 2021, 7 km north of Petrolia at the Mendocino triple junction, in a window of its first month on the West Coast map: origin time in UTC and your zone, epicentre, depth and its class, and the event id. Pick any event from the map, a card or the table to open it here.",
      targets: ["detail"],
      detour: { tour: "quake-origin", label: "The panel's record, in detail" },
      enter: showExample,
    },
    {
      id: "mechanism",
      title: "Mechanism",
      body: "The preferred moment tensor or first-motion solution as a lower-hemisphere, equal-area beachball with the T and P axes, both nodal planes (strike / dip / rake) and the faulting style. A low double-couple percentage is flagged, and planes rebuilt from the P and T axes say so. Other agencies' solutions follow.",
      targets: ["detail.mechanism"],
      enter: showExample,
      detour: { tour: "mechanism", label: "A deeper look at the focal mechanism" },
    },
    {
      id: "impact",
      title: "Impact and sequence",
      body: "Significance, Did You Feel It? reports and maximum intensity, the ShakeMap maximum MMI, the PAGER alert and the tsunami flag; then the events that followed within 150 km, or the larger event this one followed.",
      targets: ["detail.impact"],
      detour: { tour: "quake-impact", label: "Impact and sequences, in detail" },
      enter: showExample,
    },
    {
      id: "shakemap",
      title: "ShakeMap",
      body: "The selected event's USGS ShakeMap as Modified Mercalli intensity bands, from ground-motion models with site amplification and constrained by stations and felt reports. Petrolia's reached VII near the coast. Point at a band for its intensity; the legend gives the scale. USGS publishes one for most M5.5+ events, and for smaller ones in well-instrumented networks like this.",
      targets: ["map.shake", "map.stage"],
      detour: { tour: "map-shake", label: "The ShakeMap layer, in detail" },
      enter: async (ctx) => {
        await showExample(ctx);
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
      detour: { tour: "map-section", label: "Cross-sections and the profile, in detail" },
      // The profile does not depend on the selection, and the event panel would cover it.
      enter: async (ctx) => {
        await ctx.go(EXAMPLE_EVENT.window);
        await showSection(ctx);
      },
      leave: hideSection,
    },
    {
      id: "table",
      title: "Catalogue",
      body: "Every event in the window. Click a heading to sort, open a column's filter for a range or a text match (independent of the refine bar, and cleared when the region changes), and click a row to open the event.",
      targets: ["quakes.table"],
      detour: { tour: "refine-tables", label: "Sorting and the column filters, in detail" },
    },
    {
      id: "magtime",
      title: "Magnitude through time",
      body: "Each event against its origin time, with the completeness breaks of 1964, 1973 and 1976 marked when the window reaches back that far. When the floor is raised it switches to per-bin counts and maxima, so the whole window still shows.",
      targets: ["chart.magtime"],
      detour: { tour: "chart-magtime", label: "Reading this chart, in detail" },
    },
    {
      id: "fm",
      title: "Frequency–magnitude",
      body: "Cumulative N(≥M) over incremental counts, with b from the Aki (1965) maximum-likelihood estimator and the Shi & Bolt (1982) uncertainty above Mc. Magnitude types are mixed and sequences are not declustered, so read it as descriptive.",
      targets: ["chart.fm"],
      detour: { tour: "chart-fm", label: "Reading this chart, in detail" },
    },
    {
      id: "depth",
      title: "Depth distribution",
      body: "Depth against magnitude, with the 70 and 300 km boundaries between the shallow, intermediate and deep classes; the West Coast view stops at 35 km, where its seismicity is crustal.",
      targets: ["chart.depth"],
      detour: { tour: "chart-depth", label: "Reading this chart, in detail" },
    },
    {
      id: "mark",
      title: "Mark it",
      body: "Keep the event in your marks, in a group of your own, to reopen it later, stack it beside others or compare them pairwise.",
      targets: ["detail.mark"],
      enter: showExample,
    },
    {
      id: "done",
      title: "That's the catalogue",
      body: "Every step of this tour stays in the Help menu.",
      targets: ["help"],
    },
  ],
};

export const MECHANISM: Tour = {
  id: "mechanism",
  title: "Focal mechanism",
  blurb: "Reading a beachball, part by part, on the Petrolia moment tensor.",
  deep: { area: "Earthquake detail" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "sphere",
      title: "The focal sphere",
      body: "Picture a small sphere around the hypocentre: every ray leaving the source pierces it. The beachball is its lower half seen from above, in an equal-area (Schmidt) projection, so north is up, the centre points straight down and the rim is horizontal. The lower half is drawn because rays to distant stations leave the source downward.",
      targets: ["mech.ball"],
      enter: showExample,
    },
    {
      id: "quadrants",
      title: "Compression and dilatation",
      body: "The first P-wave motion is a push away from the source (compressional, up on a vertical seismometer) in two opposite quadrants and a pull back towards it (dilatational) in the other two. The compressional quadrants are shaded. The tension axis T lies at the centre of the shaded quadrants and the pressure axis P at the centre of the white ones.",
      targets: ["mech.ball"],
      enter: showExample,
    },
    {
      id: "planes",
      title: "Nodal planes",
      body: "The two great circles between the quadrants are the nodal planes, where the first motion changes sign. One is the fault and the other the auxiliary plane; the radiation pattern alone cannot tell them apart, so the aftershocks, a mapped fault or a finite-fault model decide. Each is strike / dip / rake in the Aki & Richards convention: the strike has the plane dipping to its right, the dip is from horizontal, and the rake is the slip direction of the hanging wall within the plane.",
      targets: ["mech.planes"],
      enter: showExample,
    },
    {
      id: "axes",
      title: "P and T axes",
      body: "The pressure and tension axes bisect the quadrants, at 45° to both planes, and are given by azimuth and plunge. They approximate the directions of greatest and least compressive stress only loosely: slip on a weak, pre-existing fault need not be optimally oriented in the stress field.",
      targets: ["mech.axes"],
      enter: showExample,
    },
    {
      id: "style",
      title: "Faulting style",
      body: "Read from the rake. Near +90° is reverse (thrust where the plane dips 35° or less): P near horizontal and a shaded centre. Near −90° is normal: T near horizontal and a white centre. Near 0° or 180° is strike-slip: steep planes crossing near the centre. Anything between is oblique. For strike-slip the panel gives the sense of slip on each plane; which one applies depends on which plane faulted.",
      targets: ["mech.style", "mech.ball"],
      enter: showExample,
    },
    {
      id: "moment",
      title: "Size and double couple",
      body: "For a moment tensor: the scalar moment M0 gives Mw = (2/3)(log10 M0 − 9.1) with M0 in N·m, and the centroid depth is where the inversion places the moment release, which can differ from the hypocentre where rupture began. The double-couple percentage says how much of the tensor a pure shear dislocation explains. Well below 100 % (flagged under 50 %) the planes are less diagnostic: a complex or multi-fault rupture, volume change, or simply a poorly constrained inversion.",
      targets: ["mech.moment"],
      enter: showExample,
    },
    {
      id: "others",
      title: "Other solutions",
      body: "Agencies and methods differ: W-phase, body-wave and regional waveform inversions, and first-motion polarities. The preferred solution is drawn above; comparing the others' planes shows how well the mechanism is constrained. Close agreement is a robust result.",
      targets: ["mech.others"],
      enter: showExample,
    },
  ],
};

export const VOLCANOES: Tour = {
  id: "volcanoes",
  title: "Volcanoes",
  blurb: "Agency status, the GVP record, a volcano in depth, the table and the charts.",
  pageFor: () => "volcanoes",
  steps: [
    {
      id: "intro",
      title: "The Volcanoes page",
      body: "The Smithsonian Global Volcanism Program's Holocene volcanoes, with the current alert levels of the USGS and GeoNet and the GVP/USGS weekly activity report. Each agency's scale is shown as published; they are not interchangeable. Partway through, this tour opens Kīlauea.",
      targets: [],
    },
    {
      id: "summary",
      title: "Summary",
      body: "USGS volcanoes above Normal / Green, New Zealand volcanoes at GeoNet Volcanic Alert Level 1 or above, eruptions the GVP lists as continuing, new activity in the latest weekly report, and agency level or colour changes in the last 7 days.",
      targets: ["summary"],
    },
    {
      id: "cards",
      title: "Elevated or changed",
      body: "One card per monitored volcano that is above normal or changed level in the last 7 days: the agency's level and aviation colour, since when, and the synopsis from its latest notice. A volcano that returned to normal says so.",
      targets: ["volcano.cards"],
    },
    {
      id: "refine",
      title: "Refine",
      body: "Tectonic setting, volcano type, the age of the last eruption and the current status narrow the map, the table and the charts; the summary and the cards always cover the whole region. Hide markers takes the volcanoes off the map without changing the rest.",
      targets: ["refine.volcanoes"],
      detour: { tour: "refine-volcanoes", label: "Every control of this bar, in detail" },
      enter: (ctx) => {
        ctx.setSwitch("refine.volcanoes", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("refine.volcanoes", false);
      },
    },
    {
      id: "map",
      title: "The map",
      body: "Triangles coloured by the age of the last eruption: since 1950, 1500 to 1949, earlier Holocene, or undated. A ring in the aviation colour marks an agency alert above normal, and a dot above the triangle an eruption the GVP lists as continuing. Point at a volcano for its type, last eruption and status; click it to open it.",
      targets: ["map.stage", "map.legend"],
    },
    {
      id: "record",
      title: "A volcano",
      body: "Kīlauea, from the GVP record: primary type, tectonic setting, summit elevation and position, dominant rock type, the last eruption and its evidence, and a link to its GVP page, followed by the GVP summary.",
      targets: ["volcano.record"],
      enter: showVolcano,
    },
    {
      id: "status",
      title: "Status",
      body: "Every agency level this site has recorded for the volcano, newest first, each with its aviation colour, when it was seen, the synopsis of the notice and a link to it, then the volcano's entries in the weekly report. A volcano neither agency monitors has no level here.",
      targets: ["volcano.status"],
      detour: { tour: "volcano-status", label: "Agency scales and the status history, in detail" },
      enter: showVolcano,
    },
    {
      id: "eruptions",
      title: "Eruptions",
      body: "The GVP eruption record since 1800 as a strip: bar height is the VEI, an open bar an eruption still continuing, a dashed one a queried date or size. The list gives the latest eruptions with their dates and VEI.",
      targets: ["volcano.eruptions"],
      detour: { tour: "volcano-eruptions", label: "The eruption record, in detail" },
      enter: showVolcano,
    },
    {
      id: "nearby",
      title: "Earthquakes nearby",
      body: "Earthquakes of the loaded window within 50 km, the largest first, each timed against the onset of the volcano's latest eruption; click one to open it. The earthquake window and floor come from the earthquake refine bar, so a global window at M4.5 may hold none.",
      targets: ["volcano.nearby"],
      detour: { tour: "volcano-nearby", label: "Earthquakes nearby, in detail" },
      enter: showVolcano,
    },
    {
      id: "table",
      title: "Volcano table",
      body: "Every volcano the refine bar leaves: name, country, type, last eruption, status and elevation. Click a heading to sort, open a column's filter, and click a row to open the volcano.",
      targets: ["volcanoes.table"],
    },
    {
      id: "decades",
      title: "Eruption starts per decade",
      body: "Eruption onsets since 1800 among the volcanoes shown. The rise toward the present is mostly better observation and reporting, not more volcanism.",
      targets: ["chart.decades"],
    },
    {
      id: "vei",
      title: "VEI distribution",
      body: "Eruptions by Volcanic Explosivity Index, with those lacking a VEI and those with a queried one counted in the caption. Prehistoric records favour large eruptions, which are the ones that leave deposits.",
      targets: ["chart.vei"],
    },
    {
      id: "mark",
      title: "Mark it",
      body: "Keep the volcano in your marks, beside events and other volcanoes, to reopen or compare later.",
      targets: ["volcano.mark"],
      enter: showVolcano,
    },
    {
      id: "done",
      title: "That's the volcanoes",
      body: "Every step of this tour stays in the Help menu.",
      targets: ["help"],
    },
  ],
};

/** The group the Marks tour puts its examples in; it is taken out when the tour ends. */
export const DEMO_GROUP_NAME = "Tour examples";

/** The Marks tour's examples: Petrolia, Ridgecrest and Kīlauea, as the panels would mark them. */
export const EXAMPLE_MARKS: readonly MarkDraft[] = [
  {
    kind: "event",
    ref: EXAMPLE_EVENT.id,
    name: "Petrolia 2021",
    url: EXAMPLE_EVENT.url,
    frame: "wc",
    lon: -124.298,
    lat: 40.3902,
    headline: "M6.2 mw",
    sub: "7km N of Petrolia, CA",
    stamp: "2021-12-20T20:10:31.310Z",
    mag: 6.2,
    depthKm: 27.04,
  },
  {
    kind: "event",
    ref: "ci38457511",
    name: "Ridgecrest mainshock",
    url: "/earthquakes/wc?since=2019-07-04&until=2019-08-02&event=ci38457511",
    frame: "wc",
    lon: -117.5993,
    lat: 35.7695,
    headline: "M7.1 mw",
    sub: "Ridgecrest Earthquake Sequence",
    stamp: "2019-07-06T03:19:53.040Z",
    mag: 7.1,
    depthKm: 8,
  },
  {
    kind: "volcano",
    ref: String(EXAMPLE_VOLCANO.number),
    name: "Kīlauea",
    url: EXAMPLE_VOLCANO.url,
    frame: "world",
    lon: -155.287,
    lat: 19.421,
    headline: "Kilauea",
    sub: "United States · Eastern Pacific Volcanic Regions",
    stamp: null,
    mag: null,
    depthKm: null,
  },
];

/** Opens the marks overlay over the example event, on a group and in a mode, with the examples in. */
export async function showMarks(
  ctx: StepContext,
  mode: "list" | "panels" | "matrix",
  all = false,
): Promise<void> {
  const group = ctx.demoMarks();
  const show = mode === "list" ? "" : `&show=${mode}`;
  await ctx.go(`${EXAMPLE_EVENT.url}&marks=${all ? "all" : group}${show}`);
}

export const MARKS: Tour = {
  id: "marks",
  title: "Marks",
  blurb: "Keeping events and volcanoes, grouping them, and comparing them side by side.",
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Marks",
      body: "Marks keep the events and volcanoes you want to come back to, with the view you found them in, in groups of your own. They live in this browser. For this tour three examples go into a group called Tour examples, and come out again when it ends.",
      targets: [],
      enter: showExample,
    },
    {
      id: "mark",
      title: "Marking",
      body: "Under the name in every event and volcano panel. It asks for a name (the headline and place to start with) and saves the mark with the view you are in: page, region, window and selection. The star fills once it is marked.",
      tryIt: "Mark this event; it stays in your marks after the tour.",
      targets: ["detail.mark"],
      enter: showExample,
    },
    {
      id: "open",
      title: "Your marks",
      body: "The header's Marks button, with your count, opens them over whatever page you are on; closing them leaves that page as it was.",
      targets: ["marks"],
      enter: showExample,
    },
    {
      id: "rail",
      title: "Groups",
      body: "All your marks, then each group with its count, in an order you set. New group adds one; the file controls at the foot export and import them. A mark can sit in any number of groups.",
      targets: ["marks.rail"],
      detour: { tour: "marks-groups", label: "Marking and groups, in detail" },
      enter: (ctx) => showMarks(ctx, "list", true),
    },
    {
      id: "row",
      title: "A mark",
      body: "A thumbnail of where it is, its name (click to rename), the facts it was marked with, when it was marked, and a chip for every group to put it in or take it out. Open here selects it in the page you are on; Open view goes back to the view it was marked in.",
      targets: ["marks.row"],
      enter: (ctx) => showMarks(ctx, "list", true),
    },
    {
      id: "group",
      title: "A group",
      body: "The example group. Its marks keep their own order (the arrows beside each), and the group can be renamed, moved up or down the list, or deleted without touching the marks. Show events stacks their panels; Compare sets them against each other.",
      targets: ["marks.grouphead"],
      enter: (ctx) => showMarks(ctx, "list"),
    },
    {
      id: "panels",
      title: "Stacked panels",
      body: "Every mark of the group as its full panel, one under another: origin, mechanism, impact and sequence for an event, the GVP record, status and eruptions for a volcano.",
      targets: ["marks.main"],
      detour: { tour: "marks-panels", label: "Stacked panels, in detail" },
      enter: (ctx) => showMarks(ctx, "panels"),
    },
    {
      id: "compare",
      title: "Compare",
      body: "Each pair once, in a staircase: a card reads from the mark on its left to the mark above it, with the distance between them, the time from one to the other, and the change in magnitude and depth where both are events. A volcano is dated from the onset of its latest eruption.",
      targets: ["marks.main"],
      detour: { tour: "marks-compare", label: "Reading Compare, in detail" },
      enter: (ctx) => showMarks(ctx, "matrix"),
    },
    {
      id: "io",
      title: "Export and import",
      body: "Export writes every mark and group to a JSON file; import reads one back, either merged into what is here (adding what is missing) or replacing it, after saying what the file holds.",
      targets: ["marks.io"],
      detour: { tour: "marks-io", label: "Export and import, in detail" },
      enter: (ctx) => showMarks(ctx, "list"),
    },
    {
      id: "done",
      title: "That's marks",
      body: "The example group goes when the tour ends; anything you marked yourself stays.",
      targets: ["help"],
      enter: showExample,
    },
  ],
};

/** The Space tour's windows: a week, for flares and alerts, and eleven years, for the history. */
export const SPACE_WEEK = "/space?window=7d";
export const SPACE_HISTORY = "/space?window=11y";
const week = async (ctx: StepContext): Promise<void> => {
  await ctx.go(SPACE_WEEK);
};

export const SPACE: Tour = {
  id: "space",
  title: "Space weather",
  blurb: "The Sun, the solar wind, geomagnetic activity and the aurora, now and since 1932.",
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The Space page",
      body: "NOAA SWPC's real-time solar wind, indices, X-ray and proton fluxes, flares and alerts, kept here longer than SWPC keeps them, with GFZ Potsdam's Kp since 1932, Kyoto's Dst since 1957, the latest SDO and SOHO pictures and the OVATION aurora forecast. The tour shows the last 7 days, then the last 11 years.",
      targets: [],
      enter: week,
    },
    {
      id: "status",
      title: "Status",
      body: "When the SWPC files were last read, and which spacecraft at L1 the solar wind comes from (SWPC switches between them).",
      targets: ["status"],
      enter: week,
    },
    {
      id: "window",
      title: "Window",
      body: "From 6 hours to everything since 1932, or between two moments. Up to 25 hours every sample shows; longer windows are averaged into buckets (the note says how wide), taking the maximum for indices and fluxes and the minimum for Dst and Bz, so storms are not smoothed away.",
      targets: ["space.window"],
      detour: { tour: "refine-space", label: "The window, in detail" },
      enter: week,
    },
    {
      id: "tiles",
      title: "Now",
      body: "The latest reading of each headline series over a sparkline of the window: the NOAA G, R and S scales for today, Kp, the interplanetary field Bz and Bt (GSM), solar wind speed and density, the GOES X-ray flux with its flare class, and the ≥10 MeV proton flux.",
      targets: ["space.tiles"],
      enter: week,
    },
    {
      id: "sun",
      title: "The Sun",
      body: "The latest frames from SDO (AIA 193, 304 and 171 Å, and HMI continuum and magnetogram) and SOHO's LASCO C2 and C3 coronagraphs. Rest on one for what it shows.",
      tryIt:
        "Click a picture: it opens large on the latest movie, with a higher resolution and the still, and, when that movie does not cover the window, a movie generated for it.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "alerts",
      title: "Alerts",
      body: "SWPC's watches, warnings, alerts and summaries in the window, newest first, edged by kind; open one for its full text.",
      targets: ["space.alerts"],
      enter: week,
    },
    {
      id: "stack",
      title: "The stack",
      body: "Seven rows on one time axis: Kp (G1 marked at 5), Dst, hemispheric power, Bz and Bt, speed and density, the X-ray flux with the M and X thresholds, and the ≥10 and ≥100 MeV protons with the S levels. Point anywhere for every row's value at that moment; flares shade the X-ray row and alerts tick the top.",
      targets: ["space.stack"],
      enter: week,
    },
    {
      id: "forecast",
      title: "Forecast",
      body: "SWPC's three-day forecast: the geomagnetic storm level, the chances of R1–R2 and R3+ radio blackouts and of an S1+ radiation storm, and the largest Kp expected.",
      targets: ["space.forecast"],
      enter: week,
    },
    {
      id: "flares",
      title: "Flares",
      body: "The window's flares from the GOES X-ray flux, by class and peak time. Point at one to light its band on the stack; click it to frame the stack on the flare.",
      targets: ["space.flares"],
      enter: week,
    },
    {
      id: "aurora",
      title: "Aurora",
      body: "The OVATION Prime forecast as the chance of aurora over each hemisphere, seen from above with noon at the top and the night side shaded, and the hemispheric power. Three days of frames are kept: scrub back or Play them, and the stack marks the time of a past frame.",
      targets: ["space.aurora"],
      enter: week,
    },
    {
      id: "history",
      title: "Since 1932",
      body: "Eleven years, one solar cycle. Past 93 days the stack keeps Kp, Dst and the Sun: GFZ's definitive Kp as a step over SWPC's bars (dashed while preliminary), Kyoto's hourly Dst, and the daily sunspot number with the 10.7 cm flux, with the solar-cycle minima marked. Pick Since 1932 for all of it.",
      targets: ["space.stack"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "done",
      title: "That's space weather",
      body: "Every step of this tour, and of the others, stays in the Help menu.",
      targets: ["help"],
    },
  ],
};

/** Where Refine: Earthquakes shows its examples. */
export const REFINE_URLS = {
  base: "/earthquakes",
  status: "/earthquakes?minMag=5.5",
  magnitude: "/earthquakes?minMag=6",
  depth: "/earthquakes?minDepth=70&maxDepth=300",
  /** Thirty days ending 31 July 2019 on the West Coast: the "30 days" length, with Ridgecrest. */
  window: "/earthquakes/wc?since=2019-07-01&until=2019-07-31",
  /** From moved to the M6.4 foreshock's day: a custom window. */
  custom: "/earthquakes/wc?since=2019-07-04&until=2019-07-31",
  /** Ten years of the global catalogue: more than the page draws, so the floor is raised. */
  long: "/earthquakes?since=2015-01-01&until=2024-12-31",
};
/** Opens a page of Refine: Earthquakes with the bar open or folded. */
function refineAt(url: string, open: boolean): (ctx: StepContext) => Promise<void> {
  return async (ctx) => {
    await ctx.go(url);
    ctx.setSwitch("refine.earthquakes", open);
  };
}

export const REFINE_QUAKES: Tour = {
  id: "refine-quakes",
  title: "Earthquakes",
  blurb: "The earthquake refine bar, control by control, with examples set as you go.",
  deep: { area: "Refine" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "The earthquake refine bar",
      body: "It decides which earthquakes the map, the catalogue table and the charts show; the summary tiles and the major-event cards keep to the region's preset window. Each step sets an example so you see its effect, and your own refinements come back when this ends.",
      targets: [],
      enter: refineAt(REFINE_URLS.base, false),
    },
    {
      id: "folded",
      title: "Folded",
      body: "Folded, the bar is one line saying what is in force, with the values you set picked out from the defaults. Click anywhere on it to open it; open, its first line folds it again. The ⓘ restates what it governs.",
      targets: ["refine.earthquakes"],
      enter: refineAt(REFINE_URLS.base, false),
    },
    {
      id: "status",
      title: "Status",
      body: "After a change the head line says where the page stands. Updating…, with a spinner, while the data is fetched (the map dims its markers meanwhile); ✓ Updated for a moment once everything shown reflects your refinements; Not updated when the fetch failed, so the page still shows what it had before. Point at Not updated for the reason; the error banner above offers Retry. Here the minimum magnitude just went to 5.5.",
      targets: ["refine.earthquakes.head"],
      enter: refineAt(REFINE_URLS.status, false),
    },
    {
      id: "open",
      title: "Open",
      body: "Open, the inputs: magnitude, depth, the window and Reset. A value takes effect when you leave its field or press Enter, and the address keeps every one, so a copied link opens the same refinement.",
      targets: ["refine.earthquakes"],
      enter: refineAt(REFINE_URLS.base, true),
    },
    {
      id: "magnitude",
      title: "Magnitude",
      body: "A range in whatever magnitude type the authoritative network reports (Mw, ML, mb, Md …). The minimum cannot go below the region's floor, the magnitude its catalogue is collected at (M4.5 globally, M2.5 on the West Coast); leave the maximum empty for no upper bound. Here M6 and above.",
      targets: ["refine.mag"],
      enter: refineAt(REFINE_URLS.magnitude, true),
    },
    {
      id: "depth",
      title: "Depth",
      body: "Hypocentral depth in km below sea level, as reported; either side may stay empty. Here 70 to 300 km, the intermediate-depth class: the slabs beneath the subduction zones. Shallow events can carry small negative depths, above the datum.",
      targets: ["refine.depth"],
      enter: refineAt(REFINE_URLS.depth, true),
    },
    {
      id: "window",
      title: "Window",
      body: "Calendar days, inclusive at both ends, in UTC or your browser's zone (Settings switches them). The length menu runs from 30 days to everything since 1900; From and To are the first and last day. Here 30 days ending 31 July 2019 on the West Coast, which takes in the Ridgecrest sequence.",
      targets: ["refine.window"],
      enter: refineAt(REFINE_URLS.window, true),
    },
    {
      id: "interplay",
      title: "Length, From and To together",
      body: "Picking a length moves From back from To. Changing To keeps a preset length, so From moves with it. Changing From keeps To and makes the window Custom, as here: From moved to 4 July, the day of the M6.4 foreshock. Picking a length again leaves Custom.",
      targets: ["refine.span", "refine.dates"],
      enter: refineAt(REFINE_URLS.custom, true),
    },
    {
      id: "long",
      title: "Long windows",
      body: "A long window can hold more events than the page draws at once (2,000). The marker floor is then raised to the lowest whole magnitude that fits, and this note says so: the markers, the table and the magnitude charts show the larger events, while the time chart still counts every one and the map's Density toggle shades where the rest fall. Here ten years of the global catalogue.",
      targets: ["refine.note"],
      enter: refineAt(REFINE_URLS.long, true),
    },
    {
      id: "reset",
      title: "Reset",
      body: "Back to the region's floor, no maximum, no depth bounds and the default 30-day window. It stays grey while nothing is refined.",
      targets: ["refine.reset"],
      enter: refineAt(REFINE_URLS.long, true),
    },
    {
      id: "hide",
      title: "Hide markers",
      body: "Takes the earthquakes off the map without touching the refinements: the table, the cards and the charts carry on, and on Active Earth the volcanoes stay. It lasts while you are on the page and is not kept in the address.",
      targets: ["refine.earthquakes.hide", "map.stage"],
      enter: async (ctx) => {
        await refineAt(REFINE_URLS.base, true)(ctx);
        ctx.setSwitch("refine.earthquakes.hide", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("refine.earthquakes.hide", false);
      },
    },
    {
      id: "done",
      title: "That's the refine bar",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

/**
 * Zooms the map to `times` presses of the + button from the whole region, about its centre, in one
 * move (presses in a row would interrupt each other's animation).
 */
async function zoomIn(ctx: StepContext, times: number): Promise<void> {
  const mv = await ctx.map();
  if (mv === null) return;
  const { width, height } = mv.view.value.frame;
  mv.setTransform(
    zoomIdentity
      .translate(width / 2, height / 2)
      .scale(ZOOM_STEP ** times)
      .translate(-width / 2, -height / 2),
  );
}
/** The + button's factor. */
const ZOOM_STEP = 1.8;

export const MAP_NAV: Tour = {
  id: "map-nav",
  title: "Navigation and header",
  blurb: "The map's header, the lock, zooming and panning, readouts, theater mode and the legend.",
  deep: { area: "Map" },
  pageFor: (p) => (p === "space" ? "active" : p),
  steps: [
    {
      id: "intro",
      title: "Getting around the map",
      body: "Every page but Space has a map with the same header and the same ways of moving about. Each step here does what it describes; the map comes back as you had it when this ends.",
      targets: [],
    },
    {
      id: "header",
      title: "The header",
      body: "From the left: the page's own layers (Focal mechanisms, ShakeMap, Density when a long window raised the floor), the reference layers (plate boundaries, subduction teeth, aurora, and on the West Coast the Quaternary faults), the Field select, the tools (Section, Measure, Pin), then zoom in, zoom out, Reset and Animate. Rest on any control for a second, or hold a finger on it, for what it does. On a narrow screen the header wraps onto more lines.",
      targets: ["map.tools"],
    },
    {
      id: "locked",
      title: "Locked",
      body: "The map starts locked, so the page scrolls past it: the wheel and a one-finger drag move the page, not the map. On a touch screen two fingers still pan and pinch it. The lock is drawn crossed through while locked.",
      targets: ["map.lock"],
      enter: (ctx) => {
        ctx.setSwitch("map.lock", true);
      },
    },
    {
      id: "unlocked",
      title: "Unlocked",
      body: "Unlocked, the wheel zooms about the pointer and a drag pans; the lock turns solid. Lock it again before scrolling on past the map. It is unlocked now.",
      tryIt: "Wheel over the map, then drag it.",
      targets: ["map.lock", "map.stage"],
      enter: (ctx) => {
        ctx.setSwitch("map.lock", false);
      },
    },
    {
      id: "zoom",
      title: "Zoom",
      body: "The + and − buttons zoom by 1.8× about the centre, locked or not, from the whole region (1×) to 40×; Reset returns to the whole region. Here two steps in.",
      targets: ["map.zoom"],
      enter: (ctx) => zoomIn(ctx, 2),
    },
    {
      id: "markers",
      title: "Markers as you zoom",
      body: "Epicentres and beachballs are sized from the magnitude floor at the whole-region view and grow more slowly than the map (roughly as the 0.44 power of the zoom), so clusters pull apart as you zoom in; subduction teeth keep their size on screen. On a touch screen every marker keeps a minimum size a finger can hit.",
      targets: ["map.stage"],
      enter: (ctx) => zoomIn(ctx, 3),
    },
    {
      id: "select",
      title: "Selecting moves the map",
      body: "Selecting an earthquake or a volcano, from the map, a card, a table or a mark, zooms the map to it (6× globally, 3× on the West Coast). Here the largest earthquake in the window.",
      targets: ["map.stage"],
      enter: (ctx) => {
        ctx.selectLargest();
      },
      leave: (ctx) => {
        ctx.clearSelection();
      },
    },
    {
      id: "readouts",
      title: "Readouts",
      body: "Point at an epicentre, a volcano, a plate boundary, a fault trace or a ShakeMap band for its readout beside the pointer; click an epicentre or a volcano to open it. On touch, tap it.",
      targets: ["map.stage"],
      enter: async (ctx) => {
        const mv = await ctx.map();
        mv?.reset();
      },
    },
    {
      id: "count",
      title: "What the map holds",
      body: "Top left, how many markers are drawn out of how many the window holds, and the floor when a long window raised it. While data is being fetched a chip beside it says what, and the markers dim until it lands.",
      targets: ["map.count"],
    },
    {
      id: "theater",
      title: "Theater mode",
      body: "This button, in the map's bottom-right corner, gives the map and its header the whole window, cropping the map on its long side; it unlocks while in theater, so drag to see the rest. The legend steps aside. The same button, or Esc, brings the page back. It is in theater now.",
      targets: ["map.theater"],
      enter: (ctx) => {
        ctx.setSwitch("map.theater", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("map.theater", false);
      },
    },
    {
      id: "legend",
      title: "Legend",
      body: "Under the map: the depth classes, the magnitude sizes at the floor in force, and a row for every layer that is on, with its source and scale.",
      targets: ["map.legend"],
    },
    {
      id: "done",
      title: "That's the map",
      body: "The tools on the header (Section, Measure, Pin, Field) each have a step in the Map tools tour.",
      targets: ["help"],
    },
  ],
};
