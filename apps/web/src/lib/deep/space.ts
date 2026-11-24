import type { StepContext, Tour } from "../tour.js";
import { SPACE_WEEK } from "../tour-steps.js";

/** Deep dives of the Space page, over a 7-day window unless a step needs another. */

const week = async (ctx: StepContext): Promise<void> => {
  await ctx.go(SPACE_WEEK);
};

export const SPACE_TILES: Tour = {
  id: "space-tiles",
  title: "The tiles",
  blurb: "The six summary tiles: what each reads now, its sparkline, and where it comes from.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The tiles",
      body: "Six tiles give the latest reading of each headline series, large, over a sparkline of the window. The steps use a 7-day window; your own comes back at the end.",
      targets: ["space.tiles"],
      enter: week,
    },
    {
      id: "scales",
      title: "NOAA scales",
      body: "Today's observed levels on NOAA's three scales: G for geomagnetic storms, R for radio blackouts from flares, S for solar radiation storms, each 0 to 5 and coloured by level. Under them tomorrow's forecast: the G level and the chances of R1 or more and S1 or more.",
      targets: ["space.tile.scales"],
      enter: week,
    },
    {
      id: "kp",
      title: "Kp",
      body: "SWPC's estimated planetary K index, 0 to 9 on a quasi-logarithmic scale, from the 1-minute estimate, with the latest 3-hour value under it in thirds (5−, 5o, 5+). Kp 5 is G1, 9 is G5. It is an estimate from eight stations and revises until each three-hour window closes.",
      targets: ["space.tile.kp"],
      enter: week,
    },
    {
      id: "field",
      title: "Bz and Bt",
      body: "The interplanetary magnetic field at L1 in GSM coordinates: Bz, its north–south component, large, and the total Bt under it, in nT, with the spacecraft it came from. A strongly southward (negative) Bz held for hours is what couples the solar wind into the magnetosphere and drives storms.",
      targets: ["space.tile.mag"],
      enter: week,
    },
    {
      id: "wind",
      title: "Speed and density",
      body: "The solar wind's bulk speed in km/s, large, and its proton density per cm³ under it, at L1, about 30 to 90 minutes upstream of Earth. Fast wind from a coronal hole or a CME shock shows as a step up in speed.",
      targets: ["space.tile.wind"],
      enter: week,
    },
    {
      id: "xray",
      title: "X-ray",
      body: "The GOES 0.1–0.8 nm flux as a flare class (A, B, C, M, X, each ten times the last) and in W/m² under it. M1 and above is R1 on the radio blackout scale.",
      targets: ["space.tile.xray"],
      enter: week,
    },
    {
      id: "protons",
      title: "Protons",
      body: "The GOES integral flux of protons at 10 MeV and above in pfu (particles per cm² s sr), with the ≥100 MeV flux under it. 10 pfu at ≥10 MeV is S1, and each S level is ten times more.",
      targets: ["space.tile.protons"],
      enter: week,
    },
    {
      id: "sparks",
      title: "Sparklines",
      body: "The line behind each value is the series over the window, scaled to its own range (the X-ray on a log scale), for its shape at a glance. The stack below has them all on one time axis with values.",
      targets: ["space.tiles"],
      enter: week,
    },
    {
      id: "done",
      title: "That's the tiles",
      body: "The stack's rows each have a step in Space: The stack, row by row.",
      targets: ["help"],
    },
  ],
};
