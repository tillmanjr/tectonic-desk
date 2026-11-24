import type { StepContext, Tour } from "../tour.js";

/** Deep dives of the earthquake charts, each on a window that shows its features. */

/** July 2019 on the West Coast at M3+: the Ridgecrest sequence, within what the page draws. */
export const RIDGECREST_WINDOW = "/earthquakes/wc?since=2019-07-01&until=2019-07-31&minMag=3";
/** The West Coast's default window. */
const WEST_COAST_RECENT = "/earthquakes/wc";
/** Thirty years of the global catalogue across the completeness breaks of 1964, 1973 and 1976. */
export const ERAS_WINDOW = "/earthquakes?since=1955-01-01&until=1985-12-31";

const at =
  (url: string) =>
  async (ctx: StepContext): Promise<void> => {
    await ctx.go(url);
  };

export const CHART_MAGTIME: Tour = {
  id: "chart-magtime",
  title: "Magnitude through time",
  blurb:
    "Reading the time chart: stems, sequences, binned windows and the catalogue's completeness breaks.",
  deep: { area: "Charts" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Magnitude through time",
      body: "Every event of the window against its origin time, magnitude up. The steps read it on July 2019 on the West Coast at M3 and above, the Ridgecrest sequence, then on thirty years of the global catalogue.",
      targets: ["chart.magtime"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "stems",
      title: "Stems",
      body: "Each event is a stem from the axis to its magnitude, the dot coloured by depth class; the selected event is ringed. Point at a dot for the event, click it to open it.",
      targets: ["chart.magtime"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "sequence",
      title: "A sequence's share",
      body: "When the largest event is an M6.5+ mainshock, the caption says how much of the window it and the events after it within 150 km account for: here the Ridgecrest M7.1 and the events after it make up about four fifths of July 2019 on the West Coast at M3+.",
      targets: ["chart.magtime"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "binned",
      title: "Long windows",
      body: "When a long window raises the marker floor, the chart still covers every event at the magnitude asked for: bars count the events per time bin and a dot marks the largest in each. Point at a bar for its count and largest event.",
      targets: ["chart.magtime"],
      enter: at(ERAS_WINDOW),
    },
    {
      id: "eras",
      title: "Completeness breaks",
      body: "Dashed lines mark where the catalogue changes: 1964, WWSSN and the ISC, complete to about M5.5–6; 1973, the NEIC PDE enters ComCat, complete to about M4.5; 1976, Global CMT begins and Mw is measured rather than proxied above about M5. A rise in counts across a break is the network, not the Earth; the caption names the breaks in the window.",
      targets: ["chart.magtime"],
      enter: at(ERAS_WINDOW),
    },
    {
      id: "done",
      title: "That's the time chart",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

export const CHART_FM: Tour = {
  id: "chart-fm",
  title: "Frequency–magnitude",
  blurb: "The Gutenberg–Richter plot: cumulative counts, the b-value, Mc and its caveats.",
  deep: { area: "Charts" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Frequency–magnitude",
      body: "How the window's events are spread over magnitude, on a log count axis: a Gutenberg–Richter plot. The steps read it on July 2019 on the West Coast at M3 and above, the Ridgecrest sequence.",
      targets: ["chart.fm"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "counts",
      title: "Cumulative and incremental",
      body: "The line and dots are cumulative, N(≥M), the number of events at or above each magnitude; the grey bars behind are the counts in each 0.1 bin. A straight cumulative line is the Gutenberg–Richter law, log N = a − bM.",
      targets: ["chart.fm"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "b",
      title: "The b-value",
      body: "The dashed fit and its label: b by Aki's (1965) maximum-likelihood estimator, b = log10 e / (mean M − (Mc − ΔM/2)) with 0.1 bins, and its uncertainty by Shi and Bolt (1982). Tectonic seismicity sits near 1; swarms and volcanic sequences tend higher, highly stressed crust lower.",
      targets: ["chart.fm"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "mc",
      title: "Mc",
      body: "The fit starts at the completeness magnitude Mc, taken rather than estimated: the filter minimum when you set one (here M3), else the region's catalogue floor, or the raised floor of a long window. The caption says which. Where the catalogue is incomplete above that, b reads low.",
      targets: ["chart.fm"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "caveats",
      title: "Caveats",
      body: "Networks report different magnitude types (the caption lists those in the window) and sequences are not declustered, so a big aftershock sequence dominates the fit, as Ridgecrest does here. Read it as a description of the window, not a hazard estimate.",
      targets: ["chart.fm"],
      enter: at(RIDGECREST_WINDOW),
    },
    {
      id: "done",
      title: "That's frequency–magnitude",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};

export const CHART_DEPTH: Tour = {
  id: "chart-depth",
  title: "Depth distribution",
  blurb: "Depth against magnitude: the depth classes, slabs at depth, and the crustal West Coast.",
  deep: { area: "Charts" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Depth distribution",
      body: "Each event of the window by magnitude across and hypocentral depth down, coloured by depth class. Point at one for it, click to open it. The steps read the global window, then the West Coast.",
      targets: ["chart.depth"],
      enter: at("/earthquakes"),
    },
    {
      id: "classes",
      title: "Depth classes",
      body: "Dashed lines at 70 and 300 km divide shallow, intermediate and deep events, the classes that colour every marker in the app. Globally the axis runs to 700 km: events below the shallow band are in subducting slabs, the deepest beneath Tonga–Fiji, the Kurils and South America. The caption counts each class.",
      targets: ["chart.depth"],
      enter: at("/earthquakes"),
    },
    {
      id: "crustal",
      title: "The West Coast",
      body: "On the West Coast the axis stops at 35 km, without the class lines, and the caption calls the seismicity crustal. The rare deeper events, in the subducting Juan de Fuca and Gorda slabs beneath Puget Sound and Mendocino, sit on the bottom edge. Events reported above the datum have small negative depths, plot above zero, and are counted in the caption.",
      targets: ["chart.depth"],
      enter: at(WEST_COAST_RECENT),
    },
    {
      id: "missing",
      title: "Depths not reported",
      body: "Events without a reported depth cannot be placed and are left off; the caption says how many.",
      targets: ["chart.depth"],
      enter: at(WEST_COAST_RECENT),
    },
    {
      id: "done",
      title: "That's the depth chart",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};
