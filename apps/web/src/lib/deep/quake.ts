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

export const QUAKE_IMPACT: Tour = {
  id: "quake-impact",
  title: "Impact and sequence",
  blurb:
    "Significance, felt reports, intensity, PAGER, the tsunami flag, and aftershock sequences.",
  deep: { area: "Earthquake detail" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Impact",
      body: "What the event did, as USGS records it, under Impact in the event panel; then how the panel and the cards follow a sequence. The first steps read the 2021 Petrolia M6.2.",
      targets: ["detail.impact"],
      enter: petrolia,
    },
    {
      id: "significance",
      title: "Significance",
      body: "USGS's significance number, from 0 to beyond 1,000, which combines magnitude, the maximum felt intensity, the number of felt reports and the PAGER estimate. Above about 600 an event is treated as significant.",
      targets: ["detail.impact"],
      enter: petrolia,
    },
    {
      id: "felt",
      title: "Felt reports and intensity",
      body: "Did You Feel It?: how many people reported, and the highest community intensity (CDI) from their reports. Beside it the highest Modified Mercalli intensity the ShakeMap estimates; the two can differ, as reports come only from where people are.",
      targets: ["detail.impact"],
      enter: petrolia,
    },
    {
      id: "pager",
      title: "PAGER",
      body: "The USGS PAGER alert, green, yellow, orange or red, from the estimated fatalities and economic losses, whichever is higher, coloured as USGS colours it.",
      targets: ["detail.impact"],
      enter: petrolia,
    },
    {
      id: "tsunami",
      title: "Tsunami flag",
      body: "Set when the National or Pacific Tsunami Warning Center issued information for the event. It means only that a message exists; it is not itself a warning, and many flagged events produce no tsunami.",
      targets: ["detail.impact"],
      enter: petrolia,
    },
    {
      id: "sequence",
      title: "Sequences",
      body: "An M6.5 or larger event is treated as a mainshock: the panel counts the later events of the region's preset window within 150 km, with the largest, under Sequence, and an event that follows one names it with a link. The major-event cards say the same in a line. Petrolia (M6.2) is below the threshold; the cards show any sequence in the current window.",
      targets: ["quakes.cards"],
      enter: async (ctx) => {
        await ctx.go("/earthquakes");
      },
    },
    {
      id: "done",
      title: "That's impact",
      body: "The USGS event page, at the foot of the panel, has the full products.",
      targets: ["help"],
    },
  ],
};
