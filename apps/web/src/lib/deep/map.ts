import type { StepContext, Tour } from "../tour.js";
import { EXAMPLE_EVENT, hideSection, showSection } from "../tour-steps.js";

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

/** The pin bar open on the current map, as the reader would open it. */
async function pinBar(ctx: StepContext): Promise<void> {
  const mv = await ctx.map();
  if (mv !== null && !mv.pin.open.value) mv.pin.toggle();
}

export const MAP_PIN: Tour = {
  id: "map-pin",
  title: "Pin",
  blurb: "Your own pin on each map view: placing, naming, moving, and the recent placements.",
  deep: { area: "Map" },
  pageFor: (p) => (p === "space" ? "active" : p),
  steps: [
    {
      id: "intro",
      title: "Your pin",
      body: "One pin of your own on each map view, Global and West Coast, kept in this browser: a field site, a station, home. This deep dive opens the pin bar but leaves your pin to you.",
      targets: ["map.pin"],
    },
    {
      id: "bar",
      title: "The pin bar",
      body: "Pin opens a bar under the header for this view's pin: its coordinates, a name, and what you can do with it. With no pin yet, the map is ready for one straight away. Pin again, or ×, closes the bar.",
      targets: ["map.pinbar"],
      enter: pinBar,
    },
    {
      id: "place",
      title: "Placing it",
      body: "While placing, a ghost pin follows the pointer and the bar reads its latitude and longitude in signed decimal degrees, four places; click to set it down, Esc to stop. The pin is a magenta teardrop, unlike any other mark on the map, its point on the spot.",
      tryIt: "Click the map to drop your pin.",
      targets: ["map.pinbar", "map.stage"],
      enter: pinBar,
    },
    {
      id: "name",
      title: "Naming it",
      body: "Name is optional; it shows with the coordinates when the pointer rests on the pin.",
      targets: ["map.pinbar"],
      enter: pinBar,
    },
    {
      id: "move",
      title: "Moving it",
      body: "Press and hold the pin for about half a second: it lifts, follows the pointer and sets down where you let go, so a stray drag across the map never moves it. A quick press opens the bar instead. Re-place drops it somewhere new from the bar; Remove takes it off this view.",
      tryIt: "Hold the pin, then drag it.",
      targets: ["map.pinbar", "map.stage"],
      enter: pinBar,
    },
    {
      id: "recent",
      title: "Recent",
      body: "Recent lists your last 24 placements, from both views, each with when it was placed, its name, coordinates and view. A pin moved or removed keeps its entry.",
      targets: ["map.pinbar"],
      enter: pinBar,
    },
    {
      id: "done",
      title: "That's the pin",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

/** The Petrolia event selected, with its ShakeMap on or off. */
function petrolia(shake: boolean) {
  return async (ctx: StepContext): Promise<void> => {
    await ctx.go(EXAMPLE_EVENT.url);
    ctx.setSwitch("map.shake", shake);
  };
}

export const MAP_SHAKE: Tour = {
  id: "map-shake",
  title: "ShakeMap layer",
  blurb: "A selected event's USGS ShakeMap on the map: bands, readout, legend and versions.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "ShakeMap",
      body: "The USGS ShakeMap of the selected event: the estimated shaking intensity, on the Modified Mercalli scale, at every point around it. The steps use the 2021 Petrolia M6.2.",
      targets: [],
      enter: petrolia(false),
    },
    {
      id: "toggle",
      title: "The toggle",
      body: "It acts on the selected event only. Its note says why there is nothing to draw: no event selected, still loading, none published for this event, or unavailable when USGS could not be reached. USGS publishes one for most M5.5+ events worldwide, and for smaller ones where networks are dense.",
      targets: ["map.shake"],
      enter: petrolia(false),
    },
    {
      id: "bands",
      title: "The bands",
      body: "The product's medium-resolution intensity grid, contoured at the half levels and coloured as USGS colours them. ShakeMap combines ground-motion models, site amplification from Vs30 and the station recordings and felt reports it has. The dashed outline is the edge of the grid; nothing is estimated outside it.",
      targets: ["map.shake", "map.stage"],
      enter: petrolia(true),
    },
    {
      id: "readout",
      title: "The readout",
      body: "Point anywhere inside the grid for the intensity there and what it means, as in MMI 6.4 · VI, strong shaking, light damage. Markers and boundaries keep their own readouts on top.",
      tryIt: "Point at the bands near the coast.",
      targets: ["map.stage"],
      enter: petrolia(true),
    },
    {
      id: "legend",
      title: "Its legend row",
      body: "The intensity key from I to X+, and who made the map: the contributing network, the version, whether a seismologist has reviewed it, and its maximum intensity.",
      targets: ["map.legend"],
      enter: petrolia(true),
    },
    {
      id: "versions",
      title: "Versions",
      body: "A ShakeMap is revised for hours after an event, as recordings and felt reports arrive: new versions, automatic until reviewed. This site reads it again at most every ten minutes, so a fresh event's map firms up as you watch.",
      targets: ["map.shake"],
      enter: petrolia(true),
      leave: (ctx) => {
        ctx.setSwitch("map.shake", false);
      },
    },
    {
      id: "done",
      title: "That's ShakeMap",
      body: "The event panel's Impact section gives the maximum intensity too, beside the felt reports and PAGER.",
      targets: ["help"],
    },
  ],
};

/** The Petrolia sequence's first month on the West Coast, with the replay open or closed. */
function replay(open: boolean) {
  return async (ctx: StepContext): Promise<void> => {
    await ctx.go(EXAMPLE_EVENT.window);
    ctx.setSwitch("map.animate", open);
  };
}

export const MAP_ANIMATE: Tour = {
  id: "map-animate",
  title: "Animate",
  blurb: "Replaying the window on the map: the clock, stepping, playing and the speed.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Replaying a window",
      body: "Animate replays the loaded window on the map, so a sequence unfolds in the order it happened. The steps replay the first month after the 2021 Petrolia M6.2.",
      targets: ["map.animate"],
      enter: replay(false),
    },
    {
      id: "open",
      title: "The replay bar",
      body: "Animate opens a bar under the header and the map shows only the events up to its clock, which starts at the beginning of the window. The refine bar, the table and the charts are not replayed.",
      targets: ["map.animate", "map.animbar"],
      enter: replay(true),
    },
    {
      id: "clock",
      title: "Clock and count",
      body: "Where the replay stands, in your zone or UTC, and how many of the window's events are on the map by then.",
      targets: ["anim.clock"],
      enter: replay(true),
    },
    {
      id: "step",
      title: "Stepping",
      body: "◀ and ▶ move the clock one step back or on. A step is a day for windows up to 120 days, a 30-day month up to 15 years, and a year beyond that; here a day.",
      tryIt: "Step on a few days and watch the aftershocks gather.",
      targets: ["anim.controls"],
      enter: replay(true),
    },
    {
      id: "play",
      title: "Playing, and its speed",
      body: "Start plays the steps one after another, Pause holds it, and it stops at the end of the window. Seconds per day (or month, or year) sets how fast: smaller is quicker.",
      tryIt: "Start it.",
      targets: ["anim.speed", "anim.controls"],
      enter: replay(true),
    },
    {
      id: "close",
      title: "Closing it",
      body: "Close, or Animate again, ends the replay and every event in the window comes back to the map.",
      targets: ["map.animbar"],
      enter: replay(true),
      leave: (ctx) => {
        ctx.setSwitch("map.animate", false);
      },
    },
    {
      id: "done",
      title: "That's the replay",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

/** Ten years of the global catalogue: more events than the page draws, so the floor is raised. */
export const DENSE_WINDOW = "/earthquakes?since=2015-01-01&until=2024-12-31";

function dense(shade: boolean) {
  return async (ctx: StepContext): Promise<void> => {
    await ctx.go(DENSE_WINDOW);
    ctx.setSwitch("map.density", shade);
  };
}

export const MAP_DENSITY: Tour = {
  id: "map-density",
  title: "Density and the raised floor",
  blurb:
    "What the page does when a window holds more events than it draws, and the density shading.",
  deep: { area: "Map" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "More events than fit",
      body: "The page draws at most 2,000 events at once. A window that holds more keeps every one in its counts, but draws only the larger ones and offers to shade where the rest fall. The steps load ten years of the global catalogue, 2015 to 2024.",
      targets: [],
      enter: dense(false),
    },
    {
      id: "floor",
      title: "The raised floor",
      body: "The marker floor rises to M5, M6 or M7, the lowest at which the window fits, and the refine bar says so: how many events the window holds at the magnitude you asked for, and how many the markers, the table and the magnitude charts show at the raised floor.",
      targets: ["refine.note"],
      enter: dense(false),
    },
    {
      id: "count",
      title: "The count line",
      body: "Over the map, how many markers are drawn out of how many the window holds, and the floor the markers are at.",
      targets: ["map.count"],
      enter: dense(false),
    },
    {
      id: "density",
      title: "Density",
      body: "Offered only while the floor is raised: it shades grid cells by how many events fall in each at the magnitude you asked for, those below the marker floor included, on a log scale, so the full pattern of seismicity shows under the larger events. It is on now.",
      targets: ["map.density", "map.stage"],
      enter: dense(true),
    },
    {
      id: "legend",
      title: "Its legend row",
      body: "The cell size, the magnitude counted, and the range from one event to the busiest cell.",
      targets: ["map.legend"],
      enter: dense(true),
      leave: (ctx) => {
        ctx.setSwitch("map.density", false);
      },
    },
    {
      id: "chart",
      title: "Magnitude through time",
      body: "With the floor raised the time chart still covers every event: it switches from one dot per event to counts per time bin, with each bin's largest event marked.",
      targets: ["chart.magtime"],
      enter: dense(false),
    },
    {
      id: "fit",
      title: "Getting every event back",
      body: "Shorten the window or raise the minimum magnitude until the window fits, and the floor comes back down to what you asked for; the note and the Density toggle go with it.",
      targets: ["refine.earthquakes"],
      enter: dense(false),
    },
    {
      id: "done",
      title: "That's the raised floor",
      body: "Refine: Earthquakes covers the window and magnitude controls themselves.",
      targets: ["help"],
    },
  ],
};
