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
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
    },
  ],
};
