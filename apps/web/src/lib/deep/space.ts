import type { StepContext, Tour } from "../tour.js";
import { SPACE_HISTORY, SPACE_WEEK } from "../tour-steps.js";

/** The whole record, since 1932. */
export const SPACE_ALL = "/space?window=all";

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
      targets: ["manual"],
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
      targets: ["manual"],
    },
  ],
};

export const SPACE_FLARES: Tour = {
  id: "space-flares",
  title: "Flares and alerts",
  blurb: "The flare list and what a click on a flare does, and SWPC's alerts and their kinds.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "Flares and alerts",
      body: "Two records of events in the window: the flares GOES saw, and the messages SWPC issued. Both need a window of 93 days or less. The steps use 7 days.",
      targets: ["space.flares", "space.alerts"],
      enter: week,
    },
    {
      id: "flares",
      title: "The flare list",
      body: "Each flare in the window from the GOES X-ray flux: its peak time, its class (C, M or X with the multiplier, as M2.4) and how long it lasted, newest first; the longest lists fold behind a more link.",
      targets: ["space.flares"],
      enter: week,
    },
    {
      id: "frame",
      title: "Pointing and clicking",
      body: "Point at a flare and its band lights on the stack's X-ray row; click it, or press Enter on it, and the window closes in on the flare so the stack shows it and what followed. Back to returns to the window you had.",
      tryIt: "Click a flare, then go back.",
      targets: ["space.flares", "space.row.xray"],
      enter: week,
    },
    {
      id: "alerts",
      title: "Alerts",
      body: "SWPC's messages in the window, newest on the left, one card each: its product code, headline, when it was issued and how long ago. The card's edge colour says its kind.",
      targets: ["space.alerts"],
      enter: week,
    },
    {
      id: "kinds",
      title: "Kinds of message",
      body: "A watch says conditions are expected (a geomagnetic storm watch after a CME leaves the Sun); a warning that they are imminent or under way; an alert that a threshold has been crossed; a summary closes an event with its peak. Click a card for the message in full, as SWPC wrote it.",
      tryIt: "Open a card.",
      targets: ["space.alerts"],
      enter: week,
    },
    {
      id: "done",
      title: "That's flares and alerts",
      body: "The stack's alert ticks and flare bands mark the same events on the time axis.",
      targets: ["manual"],
    },
  ],
};

export const SPACE_AURORA: Tour = {
  id: "space-aurora",
  title: "Aurora frames and playback",
  blurb: "The OVATION Prime oval: the two polar maps, times and power, the legend, and the frames.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The aurora oval",
      body: "SWPC's OVATION Prime model of where aurora can be seen, over both poles. Unlike the rest of the page it always starts on the latest frame, whatever the window.",
      targets: ["space.aurora"],
      enter: week,
    },
    {
      id: "maps",
      title: "The polar maps",
      body: "Each hemisphere seen from above the pole, noon at the top and midnight at the bottom, with the night side shaded and the coastlines drawn; the oval sits on the night side and widens toward the equator as activity rises.",
      targets: ["space.aurora.maps"],
      enter: week,
    },
    {
      id: "times",
      title: "Observed and forecast",
      body: "Each frame is computed from the solar wind observed at L1 and is a forecast for 30 to 90 minutes later, when that wind reaches Earth: both times are given. Under them the hemispheric power, the energy going into each hemisphere's aurora, in GW.",
      targets: ["space.aurora.times"],
      enter: week,
    },
    {
      id: "legend",
      title: "Chance of aurora",
      body: "The bands are the probability of aurora overhead at each point, at 10, 30, 50, 70 and 90 %. Aurora low on the horizon can be seen a few hundred kilometres equatorward of the band overhead.",
      targets: ["space.aurora.legend"],
      enter: week,
    },
    {
      id: "frames",
      title: "Frames",
      body: "This site keeps three days of frames. Drag the slider to any of them; Play steps through them half an hour at a time and Pause holds it; Latest goes back to the newest and follows each new frame. While a past frame is shown, a dashed line marks its forecast time on the stack, so it can be read against Kp and Bz.",
      tryIt: "Play the last three days.",
      targets: ["space.aurora.scrub"],
      enter: week,
    },
    {
      id: "map",
      title: "On the other maps",
      body: "The same oval can be laid over the earthquake and volcano maps with the Aurora layer, on the night side of the latest frame.",
      targets: ["space.aurora"],
      enter: week,
    },
    {
      id: "done",
      title: "That's the aurora",
      body: "Every deep dive is in the Field manual, a chapter to each part of the desk.",
      targets: ["manual"],
    },
  ],
};

export const SPACE_SUN: Tour = {
  id: "space-sun",
  title: "Sun pictures and movies",
  blurb: "The seven SDO and SOHO views, and the large view's movies, stills and generated movies.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "The Sun",
      body: "The latest frames from NASA's Solar Dynamics Observatory and the ESA/NASA SOHO coronagraphs, relayed by this site as the observatories publish them, each with the time it was taken.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "sdo",
      title: "SDO",
      body: "AIA at 193 Å: the corona at about 1.2 MK, coronal holes dark and active regions bright. At 304 Å: the chromosphere and transition region at about 50 000 K, prominences and filaments. At 171 Å: the quiet corona and its loops at 0.6 MK. HMI's intensitygram is visible light, with the sunspots; its magnetogram the line-of-sight field, white toward us and black away.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "soho",
      title: "SOHO LASCO",
      body: "The coronagraphs block the disk to see the faint corona: C2 from 1.5 to 6 solar radii, where CMEs leave the Sun, and C3 from 3.7 to 30. A halo CME, spreading all round the occulting disk, is heading toward or away from us.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "large",
      title: "The large view",
      body: "Click a picture to open it large on the observatory's latest movie: 48 hours for SDO, about four days for LASCO, 512 px; Higher resolution gives the 1024 px version and Still the latest frame, and Animation goes back to the movie. Its caption says when the movie's span differs from the page's window. ← and → step through the seven, the filmstrip picks one, and Esc or a click outside closes it.",
      tryIt: "Open a picture; Esc brings you back to this tour.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "generate",
      title: "A movie for your window",
      body: "When the latest movie does not cover the page's window, Generate animation for this window asks Helioviewer.org to build one for it, up to 300 frames (at most the last 30 days of it), after a dialog warning it may take from seconds to minutes; the ⓘ beside it explains. The SDO archive reaches back to 2010, LASCO's to 1997; a built movie is kept for six hours and shows under Generated.",
      targets: ["space.sun"],
      enter: week,
    },
    {
      id: "done",
      title: "That's the Sun",
      body: "The credits for every picture and movie are at the foot of the page and in the large view.",
      targets: ["manual"],
    },
  ],
};

export const SPACE_HISTORY_DIVE: Tour = {
  id: "space-history",
  title: "Long history",
  blurb: "Windows past 93 days: GFZ Kp since 1932, Kyoto Dst since 1957, the Sun, and the cycles.",
  deep: { area: "Space" },
  pageFor: () => "space",
  steps: [
    {
      id: "intro",
      title: "Long windows",
      body: "Past 93 days the page turns to the long records: the stack keeps three rows, Kp, Dst and the Sun, and the alerts and flares step aside, as the note says. The steps show 11 years, one solar cycle, then everything since 1932.",
      targets: ["space.longnote"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "kp",
      title: "Kp from GFZ",
      body: "GFZ Potsdam's Kp, the definitive index since 1932, as a step line over SWPC's own bars where the two overlap. Its newest stretch is preliminary until GFZ publishes the definitive values, and is drawn dashed until then. Each point is the largest Kp in its bucket, so storms keep their height.",
      targets: ["space.row.kp"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "dst",
      title: "Dst from Kyoto",
      body: "The World Data Center for Geomagnetism in Kyoto's hourly Dst since 1957, with SWPC's relay of its real-time quicklook for the newest hours. Each point is the lowest Dst in its bucket, so a storm's depth is kept.",
      targets: ["space.row.dst"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "sun",
      title: "The Sun",
      body: "The daily sunspot number on the left axis and the 10.7 cm radio flux in solar flux units on the right, both from GFZ: the two standard measures of solar activity, rising and falling together over the cycle.",
      targets: ["space.row.sun"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "cycles",
      title: "Solar cycles",
      body: "In windows over two years, a dashed line marks the month of each solar cycle's minimum, labelled with the number of the cycle it begins. Here the minimum of December 2019 that began Cycle 25, with the decline of Cycle 24 before it and Cycle 25's rise after.",
      targets: ["space.stack"],
      enter: async (ctx) => {
        await ctx.go(SPACE_HISTORY);
      },
    },
    {
      id: "all",
      title: "Since 1932",
      body: "Since 1932 shows the whole record, Cycles 17 to 25, each bucket a few weeks wide: the great storms of March 1989 and October 2003 stand out in Kp and Dst.",
      targets: ["space.stack"],
      enter: async (ctx) => {
        await ctx.go(SPACE_ALL);
      },
    },
    {
      id: "done",
      title: "That's the long history",
      body: "The sources and their licences are credited at the foot of the page.",
      targets: ["manual"],
    },
  ],
};
