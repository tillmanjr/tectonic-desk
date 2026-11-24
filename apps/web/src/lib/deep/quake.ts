import type { StepContext, Tour } from "../tour.js";
import { EXAMPLE_EVENT } from "../tour-steps.js";

/**
 * Deep dives of the earthquake panel, read on the 2021 Petrolia M6.2 (`EXAMPLE_EVENT`), whose
 * record has every part: a reviewed origin, a moment tensor and other solutions, felt reports, a
 * ShakeMap, a PAGER alert, a tsunami flag and a sequence after it.
 */

const petrolia = async (ctx: StepContext): Promise<void> => {
  await ctx.go(EXAMPLE_EVENT.url);
};

export const QUAKE_ORIGIN: Tour = {
  id: "quake-origin",
  title: "Origin and catalogue record",
  blurb: "The event panel's head, origin, depth class, catalogue record and the USGS page.",
  deep: { area: "Earthquake detail" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "The event panel",
      body: "Selecting an earthquake, from the map, a card, a table, a profile or a mark, opens its panel at the side. This deep dive reads its record from the top, on the 2021 Petrolia M6.2.",
      targets: ["detail"],
      enter: petrolia,
    },
    {
      id: "head",
      title: "Magnitude and place",
      body: "The preferred magnitude with its type as the authoritative network reports it (mw, ml, mb, md …), the place USGS gives, and a tag when the event is not an earthquake (a quarry blast, an explosion). × closes the panel; so does Esc.",
      targets: ["detail.head"],
      enter: petrolia,
    },
    {
      id: "origin",
      title: "Origin",
      body: "The origin time to the second in the zone in force, then in the other zone with how long ago; the epicentre in decimal degrees; the hypocentral depth with its class (shallow under 70 km, intermediate to 300 km, deep beyond); and the ComCat event id.",
      targets: ["detail.origin"],
      enter: petrolia,
    },
    {
      id: "catalog",
      title: "Catalogue record",
      body: "Whether a seismologist has reviewed the origin or it is still automatic, when USGS last updated it, and when this site first and last saw it in the feed. Automatic solutions are revised, magnitude and location both, as more stations come in.",
      targets: ["detail.catalog"],
      enter: petrolia,
    },
    {
      id: "usgs",
      title: "The USGS event page",
      body: "For everything this site does not show: the full ShakeMap, Did You Feel It?, the finite-fault model and every other product USGS holds for the event.",
      targets: ["detail.usgs"],
      enter: petrolia,
    },
    {
      id: "done",
      title: "That's the panel's record",
      body: "The mechanism, impact and sequence each have their own deep dive under Earthquake detail.",
      targets: ["help"],
    },
  ],
};
