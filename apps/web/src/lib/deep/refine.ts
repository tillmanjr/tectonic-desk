import type { StepContext, Tour } from "../tour.js";

/**
 * Deep dives of the Refine area: the volcano refine bar, the Space window and the tables' own
 * column filters. Each step sets a real example where the control lives in the address.
 */

/** Where Refine: Volcanoes shows its examples. */
export const VOLCANO_REFINE_URLS = {
  base: "/volcanoes",
  setting: "/volcanoes?setting=subduction",
  type: "/volcanoes?type=caldera",
  age: "/volcanoes?age=recent",
  status: "/volcanoes?status=elevated",
  combined: "/volcanoes?setting=subduction&type=stratovolcano&status=monitored",
};

function volcanoesAt(url: string, open: boolean): (ctx: StepContext) => Promise<void> {
  return async (ctx) => {
    await ctx.go(url);
    ctx.setSwitch("refine.volcanoes", open);
  };
}

export const REFINE_VOLCANOES: Tour = {
  id: "refine-volcanoes",
  title: "Volcanoes",
  blurb: "The volcano refine bar: setting, type, last eruption, status, Reset and Hide markers.",
  deep: { area: "Refine" },
  pageFor: () => "volcanoes",
  steps: [
    {
      id: "intro",
      title: "The volcano refine bar",
      body: "It decides which Holocene volcanoes the map, the volcano table and the two charts show; the summary tiles and the elevated-or-changed cards always cover the whole region. Each step sets an example; your own refinements come back when this ends.",
      targets: [],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.base, false),
    },
    {
      id: "folded",
      title: "Folded",
      body: "Folded, the bar is one line naming what is in force, with set values picked out. Click it to open it; open, its first line folds it. Its head says Updating… while the volcano catalogue and the agency statuses load, and Not updated if that failed.",
      targets: ["refine.volcanoes"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.base, false),
    },
    {
      id: "setting",
      title: "Setting",
      body: "The tectonic setting from the GVP record, grouped as subduction zone, rift zone or intraplate (the crustal-type qualifier folded in), or unknown. Here subduction zones only.",
      targets: ["refine.v.setting"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.setting, true),
    },
    {
      id: "type",
      title: "Type",
      body: "The GVP primary volcano type, grouped: stratovolcanoes, shields, calderas, cones and maars, lava domes, complexes, fissure vents, submarine volcanoes and the rest. Here calderas.",
      targets: ["refine.v.type"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.type, true),
    },
    {
      id: "age",
      title: "Last eruption",
      body: "The age class of the latest GVP-dated eruption, the same classes that colour the map's triangles: since 1950, 1500 to 1949, earlier Holocene, or no dated eruption. Here those that erupted since 1950.",
      targets: ["refine.v.age"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.age, true),
    },
    {
      id: "status",
      title: "Status",
      body: "An elevated USGS or GeoNet alert level (each agency's scale kept as published), an eruption the GVP lists as continuing, or any volcano USGS or GeoNet monitors. Here the elevated ones.",
      targets: ["refine.v.status"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.status, true),
    },
    {
      id: "combined",
      title: "Together, and Reset",
      body: "Every choice must hold at once: here monitored stratovolcanoes in subduction zones. Reset clears them all; it stays grey while nothing is set.",
      targets: ["refine.v.setting", "refine.v.reset"],
      enter: volcanoesAt(VOLCANO_REFINE_URLS.combined, true),
    },
    {
      id: "hide",
      title: "Hide markers",
      body: "Takes the volcanoes off the map without touching the refinements; the table, the cards and the charts carry on, and on Active Earth the earthquakes stay. It is not kept in the address.",
      targets: ["refine.volcanoes.hide", "map.stage"],
      enter: async (ctx) => {
        await volcanoesAt(VOLCANO_REFINE_URLS.base, true)(ctx);
        ctx.setSwitch("refine.volcanoes.hide", true);
      },
      leave: (ctx) => {
        ctx.setSwitch("refine.volcanoes.hide", false);
      },
    },
    {
      id: "done",
      title: "That's the volcano refine bar",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};

/** Where Refine: Space window shows its examples. */
export const SPACE_REFINE_URLS = {
  day: "/space?window=24h",
  month: "/space?window=30d",
  /** Three days fixed at the start of November 2026, inside this site's own record. */
  fixed: "/space?from=2026-11-01T00:00Z&to=2026-11-04T00:00Z",
  year: "/space?window=1y",
};
const spaceAt =
  (url: string) =>
  async (ctx: StepContext): Promise<void> => {
    await ctx.go(url);
  };

export const REFINE_SPACE: Tour = {
  id: "refine-space",
  title: "Space window",
  blurb: "The Space page's window: lengths, buckets, a fixed range, Live, and the long history.",
  deep: { area: "Refine" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The Space window",
      body: "One window for the whole Space page: the tiles' sparklines, the alerts, the stack and the flares all read it. The Sun pictures and the aurora oval are always the latest, whatever the window. Each step sets an example; your own window comes back when this ends.",
      targets: [],
      enter: spaceAt(SPACE_REFINE_URLS.day),
    },
    {
      id: "length",
      title: "Length",
      body: "From 6 hours to everything since 1932. A length ends now and moves with the clock: the page reads it again every minute (every 10 minutes past 93 days). Here the last 24 hours.",
      targets: ["space.span"],
      enter: spaceAt(SPACE_REFINE_URLS.day),
    },
    {
      id: "buckets",
      title: "Buckets",
      body: "Up to 25 hours every sample is drawn. A longer window is drawn as about 1,500 points per series, each a bucket of samples: the largest for Kp, the fluxes and the indices, the smallest for Dst and Bz so storms are not averaged away, and the mean for the rest. The note says how wide a bucket is. Here 30 days.",
      targets: ["space.bucket", "space.span"],
      enter: spaceAt(SPACE_REFINE_URLS.month),
    },
    {
      id: "fixed",
      title: "From and To",
      body: "Set From and To, to the minute in your zone or UTC, and the window is fixed: it no longer moves or rereads, and the length reads Custom. It may span up to 100 years. Here three days at the start of November 2026.",
      targets: ["space.dates"],
      enter: spaceAt(SPACE_REFINE_URLS.fixed),
    },
    {
      id: "live",
      title: "Live",
      body: "While the window is fixed, Live goes back to the length you had before, ending now.",
      targets: ["space.live"],
      enter: spaceAt(SPACE_REFINE_URLS.fixed),
    },
    {
      id: "long",
      title: "Past 93 days",
      body: "Beyond 93 days the minute-scale rows, the alerts and the flares give way: the stack keeps Kp, Dst and the Sun (sunspots and the 10.7 cm flux) from the long records of GFZ Potsdam and Kyoto, and this note says so. Here one year.",
      targets: ["space.span", "space.longnote"],
      enter: spaceAt(SPACE_REFINE_URLS.year),
    },
    {
      id: "done",
      title: "That's the Space window",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};

export const REFINE_TABLES: Tour = {
  id: "refine-tables",
  title: "Table filters",
  blurb: "Sorting the catalogue and volcano tables, and narrowing them by column.",
  deep: { area: "Refine" },
  pageFor: () => "active",
  steps: [
    {
      id: "intro",
      title: "The tables' own filters",
      body: "Each table can be narrowed further, column by column, after the refine bar has done its work. These filters touch only their table: the map, the charts and the other table carry on. They are not kept in the address, and changing region clears them.",
      targets: [],
    },
    {
      id: "sort",
      title: "Sorting",
      body: "Click a heading to sort by it, largest or latest first (the location from A); click it again to reverse. A table opens sorted by time, newest first.",
      targets: ["quakes.heads"],
    },
    {
      id: "open",
      title: "Opening the filters",
      body: "Filter opens a row of inputs under the headings: the catalogue takes a date range for time and a range each for magnitude and depth, in calendar days of the zone in force. It is open now.",
      tryIt: "Set a minimum magnitude here: the table narrows, the map does not.",
      targets: ["quakes.filter", "quakes.frow"],
      enter: (ctx) => {
        ctx.setSwitch("quakes.filter", true);
      },
    },
    {
      id: "state",
      title: "What is filtered",
      body: "While a column is filtered its heading is marked, the title counts how many of the window's events remain and says filtered, and Clear all appears beside Filter. Folding the row keeps the filters; Clear all drops them.",
      targets: ["quakes.table"],
      enter: (ctx) => {
        ctx.setSwitch("quakes.filter", true);
      },
    },
    {
      id: "volcanoes",
      title: "The volcano table",
      body: "The same, for volcanoes: the name contains some text, a country, a type, a range of years for the last eruption and a range of elevations. It sorts by any heading the same way.",
      targets: ["volcanoes.filter", "volcanoes.frow"],
      enter: (ctx) => {
        ctx.setSwitch("volcanoes.filter", true);
      },
    },
    {
      id: "done",
      title: "That's the table filters",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};
