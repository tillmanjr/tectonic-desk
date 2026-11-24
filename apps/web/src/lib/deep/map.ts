import type { StepContext, Tour } from "../tour.js";
import { hideSection, showSection } from "../tour-steps.js";

/**
 * Deep dives of the Map area, one per layer or tool. Steps switch layers and tools on through the
 * map view; the runner puts the map back as the reader had it.
 */

/** The West Coast earthquakes page, where every layer, the faults included, can be shown. */
export const WEST_COAST = "/earthquakes/wc";

/** Opens the West Coast map and sets the reference layers. */
function layers(on: { plates: boolean; teeth: boolean; aurora: boolean }) {
  return async (ctx: StepContext): Promise<void> => {
    await ctx.go(WEST_COAST);
    const mv = await ctx.map();
    if (mv === null) return;
    mv.showPlates.value = on.plates;
    mv.showTeeth.value = on.teeth;
    mv.showAurora.value = on.aurora;
  };
}

export const MAP_LAYERS: Tour = {
  id: "map-layers",
  title: "Reference layers and legend",
  blurb:
    "Plate boundaries and their classes, subduction teeth, the aurora, Quaternary faults, and the legend.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Reference layers",
      body: "The layers drawn under the earthquakes and volcanoes, each switched on its own from the header, and the legend that keys them. The steps use the West Coast map, where the Quaternary faults join them; your own layers come back at the end.",
      targets: [],
      enter: layers({ plates: true, teeth: true, aurora: false }),
    },
    {
      id: "plates",
      title: "Plate boundaries",
      body: "Bird's PB2002 model, each segment drawn by class: subduction heavy and solid, other convergent solid, spreading or rift dotted, transform dashed. Point at a segment for the plate pair, its class, the relative velocity and, on a subduction zone, which plate goes under.",
      targets: ["map.layers", "map.stage"],
      enter: layers({ plates: true, teeth: false, aurora: false }),
    },
    {
      id: "teeth",
      title: "Subduction teeth",
      body: "Teeth along the subduction boundaries, on the overriding plate and pointing down-dip, the polarity taken from PB2002. They keep their size on screen as you zoom, and draw whether or not the boundaries do.",
      targets: ["map.layers", "map.stage"],
      enter: layers({ plates: true, teeth: true, aurora: false }),
    },
    {
      id: "aurora",
      title: "Aurora",
      body: "The latest OVATION Prime forecast as bands of the probability of aurora, drawn over the night side only and refreshed about every five minutes while it is on; the legend gives the forecast time. It is on now.",
      targets: ["map.layers", "map.stage"],
      enter: layers({ plates: true, teeth: true, aurora: true }),
    },
    {
      id: "faults",
      title: "Quaternary faults",
      body: "On the West Coast map, the USGS Quaternary Fault and Fold Database: coloured by the age of the latest deformation, from historic (under 150 years) to Quaternary (under 1.6 Ma), solid where well constrained, dashed where moderately, dotted where inferred. The ▾ beside the box picks which ages show, and the count says how many when not all. Point at a trace for the fault, its age, slip rate, sense and dip.",
      targets: ["map.faults", "map.stage"],
      enter: layers({ plates: true, teeth: true, aurora: false }),
    },
    {
      id: "legend",
      title: "The legend",
      body: "The depth classes with their colours, the marker sizes at the magnitude floor in force, how beachballs are shaded, and a row for each layer that is on: the plate classes, the fault ages, the field's ramp, the aurora probabilities, the ShakeMap intensities. On a touch screen it adds how to move the map.",
      targets: ["map.legend"],
    },
    {
      id: "done",
      title: "That's the reference layers",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

/** Opens a map page with a field under it. */
function fieldAt(url: string, field: "none" | "gravity" | "magnetic") {
  return async (ctx: StepContext): Promise<void> => {
    await ctx.go(url);
    const mv = await ctx.map();
    if (mv !== null) mv.field.value = field;
  };
}

export const MAP_FIELDS: Tour = {
  id: "map-fields",
  title: "Fields",
  blurb: "The gravity and magnetic anomaly grids under the map: sources, ramps and the legend.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Fields",
      body: "The Field select lays one potential-field anomaly grid under everything else on the map, between the basemap and the faults, boundaries and markers. One at a time, or none. Your own choice comes back at the end.",
      targets: ["map.field"],
      enter: fieldAt("/earthquakes", "none"),
    },
    {
      id: "gravity",
      title: "Gravity, global",
      body: "The free-air gravity anomaly: Scripps marine gravity v33 (Sandwell et al. 2019) at sea, EGM2008 over land, a 6′ grid, clipped at ±120 mGal. Blue is a mass deficit (the trenches), red an excess (the outer rises, seamounts and young ridges).",
      targets: ["map.field", "map.stage"],
      enter: fieldAt("/earthquakes", "gravity"),
    },
    {
      id: "residual",
      title: "Gravity, West Coast",
      body: "On the West Coast map the isostatic residual instead: USGS DDS-9 (Simpson and Jachens), a 4 km grid, Airy–Heiskanen compensation at 2.67 g/cm³, so the long-wavelength effect of topography is taken out and shallower density contrasts stand out. Conterminous US only, free-air offshore, clipped at ±80 mGal.",
      targets: ["map.field", "map.stage"],
      enter: fieldAt(WEST_COAST, "gravity"),
    },
    {
      id: "magnetic",
      title: "Magnetic",
      body: "The total-field magnetic anomaly of EMAG2v3 (Meyer, Chulliat and Saltus 2017), on a 6′ grid upward-continued to 4 km above the geoid. Its ramp is equalised: colours follow rank rather than value, so the detail spreads across the whole ramp and the ticks are unevenly spaced.",
      targets: ["map.field", "map.stage"],
      enter: fieldAt(WEST_COAST, "magnetic"),
    },
    {
      id: "legend",
      title: "Its legend row",
      body: "The legend gains the field's ramp with its ticks and units, the source and grid, and whether the ramp is equalised. If the field file cannot be read, the select says unavailable and the next choice tries again.",
      targets: ["map.legend"],
      enter: fieldAt(WEST_COAST, "magnetic"),
    },
    {
      id: "done",
      title: "That's the fields",
      body: "The sources are credited in full at the foot of the page.",
      targets: ["help"],
    },
  ],
};

/** The West Coast map with the example section across the Mendocino triple junction. */
async function sectionOn(ctx: StepContext): Promise<void> {
  await ctx.go(WEST_COAST);
  await showSection(ctx);
}

export const MAP_SECTION: Tour = {
  id: "map-section",
  title: "Cross-section",
  blurb: "Drawing a section line, its corridor, and reading the profile under the map.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Cross-sections",
      body: "A section line on the map plots the events near it against depth along the line, under the map on the Earthquakes and Active Earth pages. The steps draw one across the Mendocino triple junction; yours comes back at the end.",
      targets: [],
      enter: async (ctx) => {
        await ctx.go(WEST_COAST);
      },
    },
    {
      id: "place",
      title: "Placing a line",
      body: "Section arms the tool: click the map for A, then for A′. A drag between the clicks still pans the map, and a click more than 3 px from where it was pressed counts as a pan, not a point. Esc or Section again stands the tool down. It is armed now.",
      tryIt: "Click two points on the map.",
      targets: ["map.section", "map.stage"],
      enter: async (ctx) => {
        await ctx.go(WEST_COAST);
        const mv = await ctx.map();
        if (mv !== null && !mv.section.armed.value) mv.section.toggle();
      },
      leave: async (ctx) => {
        const mv = await ctx.map();
        mv?.section.cancel();
      },
    },
    {
      id: "line",
      title: "The line and its corridor",
      body: "A great circle from A to A′, with the corridor shaded either side. Drag either end to move it; the profile follows when you let go.",
      tryIt: "Drag A′ along the coast.",
      targets: ["map.stage"],
      enter: sectionOn,
    },
    {
      id: "title",
      title: "The profile's title",
      body: "The line's azimuth from A to A′, its length and how many events fall inside the corridor.",
      targets: ["section.title"],
      enter: sectionOn,
    },
    {
      id: "profile",
      title: "Reading the profile",
      body: "Distance along the line across, depth down, at true scale unless exaggerated: each event projected onto the line at its hypocentral depth, coloured by depth class and sized by magnitude; click one to open it. Above, the topography and bathymetry along the line from SRTM15+, land and water filled and closed along sea level.",
      targets: ["section.profile"],
      enter: sectionOn,
    },
    {
      id: "width",
      title: "Corridor width",
      body: "How far either side of the line an event may lie and still be plotted, from 5 to 500 km. A wider corridor gathers more events and blurs structure that changes along strike.",
      targets: ["section.width"],
      enter: sectionOn,
    },
    {
      id: "ve",
      title: "Vertical exaggeration",
      body: "×1 is true scale, ×2 and ×4 stretch the depth axis. The plot stops at 480 px tall; events deeper than fit are counted in the caption under it.",
      targets: ["section.ve", "section.caption"],
      enter: sectionOn,
    },
    {
      id: "kept",
      title: "Kept, and Clear",
      body: "The line lives in the address, so it survives switching page or region and travels in a copied link. Clear takes it away.",
      targets: ["section.clear"],
      enter: sectionOn,
      leave: hideSection,
    },
    {
      id: "done",
      title: "That's the cross-section",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

/** Tokyo to Buenos Aires: about 165° apart, so the chord dips into the inner core. */
export const DEEP_MEASURE: [[number, number], [number, number]] = [
  [139.69, 35.69],
  [-58.38, -34.6],
];

/** The global map with the example measurement on it. */
async function measured(ctx: StepContext): Promise<void> {
  await ctx.go("/earthquakes");
  const mv = await ctx.map();
  if (mv === null) return;
  const [a, b] = DEEP_MEASURE;
  mv.measure.clear();
  mv.measure.toggle();
  mv.measure.place(a);
  mv.measure.place(b);
}

export const MAP_MEASURE: Tour = {
  id: "map-measure",
  title: "Measure",
  blurb: "Distances over the surface and straight through the Earth, and what the label reads.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Measure",
      body: "Measure gives the distance between two points over the surface and straight through the Earth, with how deep that straight line goes. The steps measure from Tokyo to Buenos Aires.",
      targets: [],
      enter: async (ctx) => {
        await ctx.go("/earthquakes");
      },
    },
    {
      id: "place",
      title: "Placing the ends",
      body: "Measure arms the tool: click the map for one end and again for the other. Between the clicks the label already reads to the pointer. As with sections, a click that ends a pan is not a point. It is armed now.",
      tryIt: "Click two points on the map.",
      targets: ["map.measure", "map.stage"],
      enter: async (ctx) => {
        await ctx.go("/earthquakes");
        const mv = await ctx.map();
        if (mv === null) return;
        mv.measure.clear();
        mv.measure.toggle();
      },
      leave: async (ctx) => {
        const mv = await ctx.map();
        mv?.measure.clear();
      },
    },
    {
      id: "surface",
      title: "Over the surface",
      body: "The first line of the label: Δ, the angle between the two points at the Earth's centre, and the great-circle distance along the surface, which the dashed line follows.",
      targets: ["map.stage"],
      enter: measured,
    },
    {
      id: "chord",
      title: "Through the Earth",
      body: "The second line: the chord, the straight line between the two points through the Earth (2R sin Δ/2), how deep its midpoint dips below the surface (R(1 − cos Δ/2)), and the PREM layer at that depth: crust, upper mantle, transition zone, lower mantle, outer core or inner core. From Tokyo to Buenos Aires it reaches the inner core.",
      targets: ["map.stage"],
      enter: measured,
    },
    {
      id: "drag",
      title: "Moving the ends",
      body: "Drag either diamond to move that end; the label follows as you drag, and turns to sit below the line near the top of the map.",
      tryIt: "Drag the Buenos Aires end up the coast.",
      targets: ["map.stage"],
      enter: measured,
    },
    {
      id: "accuracy",
      title: "Accuracy, and clearing",
      body: "The Earth is taken as a sphere of radius 6371 km, which puts the surface distance within about 0.5 % of the WGS84 geodesic. A measurement is kept only while you are on the page, not in the address; Measure again clears it.",
      targets: ["map.measure"],
      enter: measured,
    },
    {
      id: "done",
      title: "That's measuring",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};
