import type { StepContext, Tour } from "../tour.js";

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
