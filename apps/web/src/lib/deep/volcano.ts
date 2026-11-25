import type { StepContext, Tour } from "../tour.js";
import { EXAMPLE_VOLCANO } from "../tour-steps.js";

/** Deep dives of the volcano panel, read on Kīlauea (`EXAMPLE_VOLCANO`). */

const kilauea = async (ctx: StepContext): Promise<void> => {
  await ctx.go(EXAMPLE_VOLCANO.url);
};

export const VOLCANO_STATUS: Tour = {
  id: "volcano-status",
  title: "Agency status and scales",
  blurb:
    "USGS and GeoNet alert levels, aviation colours, the status history and the weekly report.",
  deep: { area: "Volcano detail" },
  pageFor: () => "volcanoes",
  steps: [
    {
      id: "intro",
      title: "Status",
      body: "Under Status, the volcano panel lists what the monitoring agencies have said about the volcano, as this site recorded it. The steps read Kīlauea, which the USGS Hawaiian Volcano Observatory watches.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "usgs",
      title: "The USGS scale",
      body: "USGS gives two codes together: a ground-based alert level, Normal, Advisory, Watch or Warning, for hazards on the ground, and an aviation colour code, Green, Yellow, Orange or Red, for ash in the air. Anything above Normal and Green counts as elevated, and the colour rings the volcano on the map.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "geonet",
      title: "GeoNet's scale",
      body: "New Zealand's GeoNet uses its own Volcanic Alert Level, 0 to 5 (1 and 2 for unrest, 3 to 5 for eruption), with an aviation colour code of its own. The two agencies' scales mean different things, so each is shown as published and never converted.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "history",
      title: "The history",
      body: "Every level or colour this site has recorded, newest first: when it was seen, the synopsis of the agency's notice, and a link to the notice itself. The first record of a volcano is where this site started watching, not a change.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "weekly",
      title: "Weekly report",
      body: "Below it, the volcano's entries in the Smithsonian and USGS Weekly Volcanic Activity Report, marked as new or ongoing activity, whenever the report's feed could be read.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "cards",
      title: "On the page",
      body: "The same statuses drive the page: the summary tiles count elevated volcanoes per agency and the status changes of the last 7 days, and the cards show each volcano that is elevated or changed, with its level and latest synopsis.",
      targets: ["volcano.cards"],
      enter: kilauea,
    },
    {
      id: "unmonitored",
      title: "Not monitored here",
      body: "A volcano neither USGS nor GeoNet monitors says so, and carries no level here: other observatories' scales are not read.",
      targets: ["volcano.status"],
      enter: kilauea,
    },
    {
      id: "done",
      title: "That's volcano status",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};

export const VOLCANO_ERUPTIONS: Tour = {
  id: "volcano-eruptions",
  title: "Eruption record",
  blurb:
    "The GVP record: last eruption and evidence, the strip since 1800, VEI and the eruption list.",
  deep: { area: "Volcano detail" },
  pageFor: () => "volcanoes",
  steps: [
    {
      id: "intro",
      title: "The eruption record",
      body: "The panel's record comes from the Smithsonian Global Volcanism Program's Volcanoes of the World. The steps read Kīlauea, one of the most frequently erupting volcanoes in it.",
      targets: ["volcano.record"],
      enter: kilauea,
    },
    {
      id: "last",
      title: "Last eruption and evidence",
      body: "At the top: the year of the latest dated eruption and the GVP's evidence for activity, from eruptions observed in historical time to dated deposits or none at all, then the GVP's own summary of the volcano. The last eruption's age sets the triangle's colour on the map.",
      targets: ["volcano.record"],
      enter: kilauea,
    },
    {
      id: "strip",
      title: "The strip since 1800",
      body: "Each eruption since 1800 as a bar at its start year; the height is its Volcanic Explosivity Index. An open bar is an eruption still continuing, a dashed one has a VEI the GVP marks uncertain. Point at a bar for its start, VEI and whether it continues. The caption counts them and the earlier ones.",
      targets: ["volcano.eruptions"],
      enter: kilauea,
    },
    {
      id: "vei",
      title: "VEI",
      body: "The Volcanic Explosivity Index of Newhall and Self (1982), 0 to 8, a log scale of erupted volume and plume height: each step is about ten times more tephra. Effusive basaltic eruptions like most of Kīlauea's sit at 0 to 1 however long they last.",
      targets: ["volcano.eruptions"],
      enter: kilauea,
    },
    {
      id: "list",
      title: "The list",
      body: "The latest eight eruptions: the start date to the precision the GVP has it, with its modifier or uncertainty, the end year or continuing, the VEI, and the activity type when it is not a confirmed eruption.",
      targets: ["volcano.eruptions"],
      enter: kilauea,
    },
    {
      id: "done",
      title: "That's the eruption record",
      body: "The GVP number in the record links to the volcano's full page at the Smithsonian.",
      targets: ["manual"],
    },
  ],
};

/** Kīlauea in May to August 2018: the summit collapse and the lower East Rift Zone eruption. */
export const KILAUEA_2018 = "/volcanoes/global?since=2018-05-01&until=2018-08-31&volcano=332010";

export const VOLCANO_NEARBY: Tour = {
  id: "volcano-nearby",
  title: "Earthquakes nearby",
  blurb:
    "The earthquakes within 50 km of a volcano, which window they come from, and their timing.",
  deep: { area: "Volcano detail" },
  pageFor: () => "volcanoes",
  steps: [
    {
      id: "intro",
      title: "Earthquakes nearby",
      body: "At the foot of the volcano panel, the earthquakes within 50 km of the summit, the largest three with a count of all of them. The steps read Kīlauea in 2018.",
      targets: ["volcano.nearby"],
      enter: async (ctx) => {
        await ctx.go(KILAUEA_2018);
      },
    },
    {
      id: "window",
      title: "Which earthquakes",
      body: "Those of the earthquake window and refinements in force, set from the Earthquakes or Active Earth refine bar and kept in the address across pages. Here May to August 2018, the summit collapse and the lower East Rift Zone eruption, with the M6.9 of 4 May and the repeated M5 collapse events.",
      targets: ["volcano.nearby"],
      enter: async (ctx) => {
        await ctx.go(KILAUEA_2018);
      },
    },
    {
      id: "timing",
      title: "Timing",
      body: "Each is timed against the onset of the volcano's latest eruption in the GVP record, so earlier windows read as before onset; in the onset day, month or year when the GVP dates it only that finely. A volcano with no dated eruption gives how long ago instead.",
      targets: ["volcano.nearby"],
      enter: async (ctx) => {
        await ctx.go(KILAUEA_2018);
      },
    },
    {
      id: "open",
      title: "Opening one",
      body: "Click an earthquake to open it; its panel takes the volcano panel's place, and the map moves to it.",
      tryIt: "Open the largest.",
      targets: ["volcano.nearby"],
      enter: async (ctx) => {
        await ctx.go(KILAUEA_2018);
      },
    },
    {
      id: "done",
      title: "That's earthquakes nearby",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};
