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
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};
