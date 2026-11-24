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

export const SPACE_STACK: Tour = {
  id: "space-stack",
  title: "The stack, row by row",
  blurb: "Each row of the stack: what it plots, its reference lines, and the readout across them.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The stack",
      body: "Seven rows on one time axis, so a storm can be followed from the Sun to the ground: X-ray and protons at the Sun, the solar wind and its field at L1, Kp, Dst and the auroral power at Earth. The steps use a 7-day window.",
      targets: ["space.stack"],
      enter: week,
    },
    {
      id: "kp",
      title: "Kp",
      body: "SWPC's Kp as a bar over each three-hour window, coloured by the G level it reaches, with a line at 5 for G1. The current window's bar revises until the window closes.",
      targets: ["space.row.kp"],
      enter: week,
    },
    {
      id: "dst",
      title: "Dst",
      body: "The disturbance storm-time index in nT, hourly, from Kyoto's real-time quicklook relayed by SWPC: the strength of the ring current. A storm drives it negative, to −50 nT for a moderate one, −100 for intense, past −250 for a great storm, and it recovers over days.",
      targets: ["space.row.dst"],
      enter: week,
    },
    {
      id: "power",
      title: "Hemispheric power",
      body: "The energy OVATION Prime puts into each hemisphere's aurora, north and south, in GW. It rises within an hour of a southward turn of Bz.",
      targets: ["space.row.power"],
      enter: week,
    },
    {
      id: "mag",
      title: "Bz and Bt",
      body: "The interplanetary field at L1 in GSM coordinates: Bz with a line at zero, Bt as its envelope. Southward, negative Bz held for hours is what drives a storm; watch Kp and Dst answer it.",
      targets: ["space.row.mag"],
      enter: week,
    },
    {
      id: "wind",
      title: "Speed and density",
      body: "Solar wind speed on the left axis in km/s and proton density on the right in /cm³. A CME's shock arrives as a jump in both; a coronal hole stream as a slow rise in speed with density falling.",
      targets: ["space.row.wind"],
      enter: week,
    },
    {
      id: "xray",
      title: "X-ray",
      body: "The GOES long (0.1–0.8 nm) and short (0.05–0.4 nm) channels on a log scale, with lines at M1 (R1) and X1 (R3). The window's flares shade the row from start to end.",
      targets: ["space.row.xray"],
      enter: week,
    },
    {
      id: "protons",
      title: "Protons",
      body: "The ≥10 and ≥100 MeV integral fluxes in pfu on a log scale, with lines at the S1, S2 and S3 thresholds of the ≥10 MeV flux.",
      targets: ["space.row.protons"],
      enter: week,
    },
    {
      id: "readout",
      title: "The readout",
      body: "Point anywhere on the stack: a line drops through every row and each row gives its value at that moment, so you can read the delay from a shock at L1 to the Kp it raises. Triangles along the top are SWPC alerts; point at one for it.",
      tryIt: "Run the pointer along the stack.",
      targets: ["space.stack"],
      enter: week,
    },
    {
      id: "done",
      title: "That's the stack",
      body: "Space: Long history covers the rows a window past 93 days keeps.",
      targets: ["help"],
    },
  ],
};
