import type { StepContext, Tour } from "../tour.js";

/** Deep dives of the earthquake charts, each on a window that shows its features. */

/** July 2019 on the West Coast at M3+: the Ridgecrest sequence, within what the page draws. */
export const RIDGECREST_WINDOW = "/earthquakes/wc?since=2019-07-01&until=2019-07-31&minMag=3";
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
