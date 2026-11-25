import type { TourId } from "./tour.js";

/**
 * The Field manual's Glossary: the science terms the desk shows and the desk's own words, each with a
 * one-line definition (the hint a linked label shows) and a short paragraph for a peer. Entries are
 * keyed by id, so a `v-term` in a template names one that exists.
 */

export type GlossaryArea = "earthquakes" | "volcanoes" | "space" | "maps" | "desk";

export const AREA_NAMES: Record<GlossaryArea, string> = {
  earthquakes: "Earthquakes",
  volcanoes: "Volcanoes",
  space: "Space",
  maps: "Maps and fields",
  desk: "The desk",
};
export const GLOSSARY_AREAS = Object.keys(AREA_NAMES).filter(
  (a): a is GlossaryArea => a in AREA_NAMES,
);

export interface GlossaryEntry {
  term: string;
  area: GlossaryArea;
  /** One line: the hint on the desk and the entry's first sentence. */
  short: string;
  /** What it measures, its units and scale, and how the desk uses it. */
  long: string;
  /** A few rows of its scale, value then meaning. */
  scale?: readonly (readonly [string, string])[];
  /** Related entries, by id. */
  see?: readonly string[];
  /** The deep dive that shows it on the desk. */
  dive?: TourId;
  /** Who defines or publishes it. */
  source?: string;
}

export const GLOSSARY = {
  // ---- Earthquakes ----
  "b-value": {
    term: "b-value",
    area: "earthquakes",
    short:
      "The slope of the Gutenberg–Richter relation log₁₀ N(≥M) = a − bM; close to 1 for most tectonic catalogues.",
    long: "The frequency–magnitude chart fits it by Aki's (1965) maximum-likelihood estimator above the magnitude of completeness, with Shi and Bolt's (1982) uncertainty. High values are reported for swarms and volcanic settings, low ones before some large events; a mixed-type, undeclustered catalogue makes it descriptive rather than diagnostic.",
    see: ["mc", "magnitude-type", "sequence"],
    dive: "chart-fm",
  },
  beachball: {
    term: "Beachball",
    area: "earthquakes",
    short:
      "A focal mechanism drawn as a lower-hemisphere equal-area projection: compressional quadrants shaded, dilatational white.",
    long: "The nodal planes are the boundaries between the quadrants, the T axis sits in the middle of the shaded quadrants and the P axis in the middle of the white ones. The map draws one for each event with a solution when Mechanisms is on; the event panel draws the preferred solution larger, flat or as a bowl.",
    see: ["nodal-plane", "t-axis", "p-axis", "bowl", "mechanism-class"],
    dive: "mechanism",
  },
  cdi: {
    term: "CDI (DYFI)",
    area: "earthquakes",
    short:
      "Community Decimal Intensity: the intensity people report through USGS “Did You Feel It?”, on the MMI scale.",
    long: "Reports are pooled by postcode or by 1 and 10 km boxes and converted to a decimal intensity. It samples where people are, so it is dense in cities and absent offshore; read it beside the ShakeMap MMI, which also uses instruments.",
    see: ["mmi", "dyfi-reports"],
    dive: "quake-impact",
    source: "USGS Did You Feel It?",
  },
  "centroid-depth": {
    term: "Centroid depth",
    area: "earthquakes",
    short:
      "The depth of the moment release found by the moment-tensor inversion, which can differ from the hypocentre's.",
    long: "The hypocentre is where rupture began, from first arrivals; the centroid is the moment-weighted middle of the rupture, from long-period waveforms. For large events they can be tens of kilometres apart.",
    see: ["depth", "moment-tensor"],
    dive: "mechanism",
  },
  comcat: {
    term: "ComCat",
    area: "earthquakes",
    short: "The USGS ANSS Comprehensive Earthquake Catalog, the source of every event on the desk.",
    long: "It merges the contributing networks' solutions and names one preferred origin and magnitude per event. The desk keeps its own copy from 1900 at M2.5 and above, refreshed from the feeds, so a window can reach further back than the feeds do.",
    see: ["event-id", "review-status", "eras"],
    dive: "quake-origin",
    source: "USGS ANSS",
  },
  depth: {
    term: "Depth",
    area: "earthquakes",
    short:
      "Hypocentral depth below sea level, classed shallow (< 70 km), intermediate (70–300 km) or deep (> 300 km).",
    long: "Markers are coloured by these classes. Depth is the least well constrained coordinate of an origin; many shallow events are fixed at a default (10 km is common) when the network cannot resolve it.",
    see: ["centroid-depth", "epicentre"],
    dive: "chart-depth",
  },
  "double-couple": {
    term: "Double couple",
    area: "earthquakes",
    short:
      "How much of the moment tensor a pure shear dislocation explains; the rest is CLVD or volume change.",
    long: "Shown as a percent. Well-recorded tectonic events usually exceed 80%. Low values come from noise, complex or multi-fault rupture, or volumetric sources such as caldera collapse; read the beachball of a low double-couple solution with caution.",
    see: ["moment-tensor", "beachball"],
    dive: "mechanism",
  },
  "dyfi-reports": {
    term: "DYFI reports",
    area: "earthquakes",
    short: "How many people answered USGS “Did You Feel It?” for the event.",
    long: "A count of responses, not of people who felt it. It grows for hours after an event and depends on population and time of day as much as on shaking.",
    see: ["cdi"],
    dive: "quake-impact",
    source: "USGS Did You Feel It?",
  },
  epicentre: {
    term: "Epicentre",
    area: "earthquakes",
    short: "The point on the surface above the hypocentre, in decimal degrees.",
    long: "The map's markers sit on it; distances in the ShakeMap readout and the sequence rule are measured from it.",
    see: ["depth"],
    dive: "quake-origin",
  },
  eras: {
    term: "Catalogue eras",
    area: "earthquakes",
    short:
      "The breaks in what the global catalogue can detect: 1964 (WWSSN, ISC), 1973 (NEIC PDE) and 1976 (Global CMT).",
    long: "Before 1964 the global record is complete only to about M6; from 1973 to about M4.5; from 1976 moment magnitudes are measured rather than proxied above about M5. The magnitude-through-time chart marks the three years.",
    scale: [
      ["1964", "complete to about M5.5–6"],
      ["1973", "complete to about M4.5"],
      ["1976", "Mw measured above about M5"],
    ],
    see: ["mc", "comcat"],
    dive: "chart-magtime",
  },
  "event-id": {
    term: "Event ID",
    area: "earthquakes",
    short:
      "The ComCat identifier: the contributing network's code then its number, such as nc73666231.",
    long: "An event can carry several ids when networks merge their solutions; the desk follows the preferred one and drops rows for ids that merge into it. The id opens the USGS event page.",
    see: ["comcat"],
    dive: "quake-origin",
  },
  "magnitude-type": {
    term: "Magnitude type",
    area: "earthquakes",
    short:
      "Which scale a magnitude is on: Mw (moment), mb (body wave), Ms (surface wave), ML (local), Md (duration) and others.",
    long: "Each event carries its preferred magnitude, whatever its type. The scales agree roughly in the middle of their ranges and part at the ends: mb and ML saturate for large events, which is why Mw is preferred above about M5.",
    see: ["moment-magnitude", "b-value"],
    dive: "quake-origin",
  },
  mc: {
    term: "Magnitude of completeness (Mc)",
    area: "earthquakes",
    short:
      "The magnitude above which a catalogue holds every event in its region and time; below it, events are missing.",
    long: "The frequency–magnitude chart takes Mc from the window's floor or from where the counts turn over, and fits the b-value above it only. Mc falls through time as networks densify.",
    see: ["b-value", "eras", "floor"],
    dive: "chart-fm",
  },
  "mechanism-class": {
    term: "Mechanism class",
    area: "earthquakes",
    short: "Strike-slip, normal, reverse or oblique, from the plunges of the T, P and null axes.",
    long: "A steep P axis is normal faulting, a steep T axis reverse, a steep null axis strike-slip; in between the solution is oblique. The panel names the class beside the beachball.",
    see: ["t-axis", "p-axis", "nodal-plane"],
    dive: "mechanism",
  },
  mmi: {
    term: "MMI",
    area: "earthquakes",
    short:
      "Modified Mercalli Intensity: shaking and damage at a place, I to X in practice, estimated by USGS ShakeMap.",
    long: "ShakeMap interpolates recorded ground motion, felt reports and a ground-motion model onto a grid. The ShakeMap layer draws it as bands and reads the intensity and the distance from the epicentre under the pointer; the panel's Max MMI is the product's own maximum.",
    scale: [
      ["IV", "light shaking, no damage"],
      ["VI", "strong shaking, light damage"],
      ["VIII", "severe shaking, moderate to heavy damage"],
    ],
    see: ["cdi", "shakemap", "pager"],
    dive: "map-shake",
    source: "USGS ShakeMap",
  },
  "moment-magnitude": {
    term: "Moment magnitude (Mw)",
    area: "earthquakes",
    short: "Magnitude from the seismic moment M₀: Mw = ⅔ (log₁₀ M₀ − 9.1), with M₀ in N·m.",
    long: "It does not saturate for great earthquakes. The panel shows the moment tensor's own Mw beside the event's preferred magnitude, which may be of another type.",
    see: ["scalar-moment", "magnitude-type"],
    dive: "mechanism",
  },
  "moment-tensor": {
    term: "Moment tensor",
    area: "earthquakes",
    short:
      "The symmetric 3 × 3 tensor of force couples that represents a point source, found by inverting waveforms.",
    long: "Its eigenvectors are the T, null and P axes and its size is the scalar moment; its non-double-couple part is what the double-couple percent leaves out. A first-motion focal mechanism gives the planes but no moment.",
    see: ["double-couple", "scalar-moment", "t-axis"],
    dive: "mechanism",
  },
  "nodal-plane": {
    term: "Nodal plane",
    area: "earthquakes",
    short:
      "One of the two orthogonal planes of a focal mechanism, given as strike / dip / rake; one is the fault.",
    long: "First motions alone cannot say which plane slipped; geology, aftershocks or a finite-fault model decide. When a solution gives only the T and P axes the desk rebuilds the planes and says so.",
    see: ["beachball", "t-axis", "p-axis"],
    dive: "mechanism",
  },
  "p-axis": {
    term: "P axis",
    area: "earthquakes",
    short:
      "Pressure axis: the direction of greatest compression, in the middle of the dilatational (white) quadrants.",
    long: "Given as azimuth and plunge. It lies at 45° to both nodal planes, in the plane normal to the null axis. On the beachball it is the P mark.",
    see: ["t-axis", "nodal-plane"],
    dive: "mechanism",
  },
  pager: {
    term: "PAGER alert",
    area: "earthquakes",
    short:
      "USGS PAGER's colour for the estimated fatalities and economic losses: green, yellow, orange or red.",
    long: "PAGER combines ShakeMap intensity with population and building vulnerability. The alert is the higher of the two estimates; it is revised as the ShakeMap is.",
    scale: [
      ["Yellow", "1–99 deaths or $1–100 M"],
      ["Orange", "100–999 deaths or $100 M–1 B"],
      ["Red", "1,000+ deaths or $1 B+"],
    ],
    see: ["mmi", "significance"],
    dive: "quake-impact",
    source: "USGS PAGER",
  },
  "review-status": {
    term: "Review status",
    area: "earthquakes",
    short: "Automatic until a network seismologist reviews the solution, then reviewed.",
    long: "Automatic solutions can move, change magnitude or be deleted. The desk keeps polling an event's detail while it is fresh, so the panel catches the reviewed values.",
    see: ["comcat"],
    dive: "quake-origin",
  },
  "scalar-moment": {
    term: "Scalar moment (M₀)",
    area: "earthquakes",
    short: "The size of the source: rigidity × fault area × average slip, in N·m.",
    long: "From the moment tensor. Every unit of Mw is about 32 times the moment; M₀ of 10¹⁹ N·m is about Mw 6.6.",
    see: ["moment-magnitude", "moment-tensor"],
    dive: "mechanism",
  },
  sequence: {
    term: "Sequence",
    area: "earthquakes",
    short:
      "The desk's rule for related events: later events within 150 km, at or above the region's floor.",
    long: "A simple window, not a declustering: it counts aftershocks and anything else nearby. The panel lists the count and the largest; an event inside another's sequence links back to it.",
    see: ["b-value"],
    dive: "quake-impact",
  },
  shakemap: {
    term: "ShakeMap",
    area: "earthquakes",
    short:
      "USGS's map of ground shaking for an event: MMI and peak motions on a grid, from stations, reports and a model.",
    long: "Made for significant events and updated as data arrive; automatic versions are later reviewed. The ShakeMap layer draws its medium-resolution MMI grid as bands for the selected event.",
    see: ["mmi", "pager"],
    dive: "map-shake",
    source: "USGS ShakeMap",
  },
  significance: {
    term: "Significance",
    area: "earthquakes",
    short:
      "USGS's 0 to 1000+ score from magnitude, maximum intensity, felt reports and estimated impact.",
    long: "600 and above counts as significant in the USGS feeds. A small event under a city can outscore a large one at sea.",
    see: ["pager", "dyfi-reports"],
    dive: "quake-impact",
  },
  "t-axis": {
    term: "T axis",
    area: "earthquakes",
    short:
      "Tension axis: the direction of least compression, in the middle of the compressional (shaded) quadrants.",
    long: "Given as azimuth and plunge. With the P axis it fixes the nodal planes; when a solution lacks the planes the desk rebuilds them from T and P and says so.",
    see: ["p-axis", "nodal-plane"],
    dive: "mechanism",
  },
  tsunami: {
    term: "Tsunami flag",
    area: "earthquakes",
    short:
      "Set by USGS for large events in oceanic regions to point to the tsunami warning centres; not a report of a tsunami.",
    long: "Check the NOAA Tsunami Warning Centers for whether one was generated. The flag says only that the event met their criteria for a message.",
    dive: "quake-impact",
  },
  // ---- Volcanoes ----
  "alert-level": {
    term: "Volcano Alert Level",
    area: "volcanoes",
    short:
      "USGS's ground-hazard level: Normal, Advisory, Watch or Warning, set by each volcano observatory.",
    long: "Paired with the Aviation Colour Code. The desk keeps every change as its own row, so the panel shows when the current level was set; a volcano's first row is a baseline, not a change.",
    scale: [
      ["Advisory", "elevated unrest"],
      ["Watch", "heightened unrest or minor eruption"],
      ["Warning", "hazardous eruption under way or imminent"],
    ],
    see: ["aviation-colour", "geonet-val"],
    dive: "volcano-status",
    source: "USGS Volcano Hazards Program",
  },
  "aviation-colour": {
    term: "Aviation Colour Code",
    area: "volcanoes",
    short: "The ash hazard to aircraft: Green, Yellow, Orange or Red.",
    long: "Set with the alert level by USGS observatories and internationally by others under ICAO. Orange means an eruption with no or minor ash, or one expected; Red means significant ash in the air or imminent. The status dots use it.",
    see: ["alert-level"],
    dive: "volcano-status",
  },
  "geonet-val": {
    term: "GeoNet Volcanic Alert Level",
    area: "volcanoes",
    short: "New Zealand's level from 0 (no unrest) to 5 (major eruption).",
    long: "1 is minor unrest and 2 moderate to heightened unrest; 3 to 5 are eruptions of increasing size. The desk shows it on its own scale, never mapped onto the USGS levels.",
    see: ["alert-level"],
    dive: "volcano-status",
    source: "GNS Science GeoNet",
  },
  "gvp-number": {
    term: "GVP number",
    area: "volcanoes",
    short: "The Smithsonian Global Volcanism Program's six-digit number for a volcano.",
    long: "The key the desk joins every agency on. It opens the volcano's GVP page, with its full eruption history.",
    see: ["holocene"],
    dive: "volcano-eruptions",
    source: "Smithsonian GVP",
  },
  holocene: {
    term: "Holocene volcano",
    area: "volcanoes",
    short:
      "A volcano with an eruption, or evidence of activity, in the last 11,700 years: the set GVP catalogues and the desk maps.",
    long: "Markers are coloured by the last known eruption (recent, historical, Holocene, unknown). An old last eruption does not make a volcano extinct.",
    see: ["last-eruption", "gvp-number"],
    dive: "refine-volcanoes",
    source: "Smithsonian GVP",
  },
  "last-eruption": {
    term: "Last eruption",
    area: "volcanoes",
    short: "The year of the most recent confirmed eruption in GVP's record, or unknown.",
    long: "Dates before about 1500 usually come from radiocarbon or tephra stratigraphy and carry their uncertainty in GVP's record. The volcano refine bar filters by it.",
    see: ["holocene", "vei"],
    dive: "volcano-eruptions",
  },
  "volcano-type": {
    term: "Volcano type",
    area: "volcanoes",
    short: "GVP's primary landform: stratovolcano, shield, caldera, lava dome, cone, and so on.",
    long: "The dominant form only; many volcanoes are compound. The table filters by it.",
    see: ["tectonic-setting"],
    dive: "volcano-eruptions",
  },
  "tectonic-setting": {
    term: "Tectonic setting",
    area: "volcanoes",
    short:
      "Where GVP places a volcano: subduction zone, rift zone or intraplate, and on what crust.",
    long: "Crust thickness is given as continental (> 25 km), intermediate or oceanic. It is the first thing to check when comparing two volcanoes.",
    see: ["volcano-type", "plate-boundaries"],
  },
  vei: {
    term: "VEI",
    area: "volcanoes",
    short:
      "Volcanic Explosivity Index, 0 to 8, from erupted tephra volume and plume height; above VEI 2 each step is ten times the volume.",
    long: "GVP assigns it per eruption. Effusive eruptions rate low whatever their lava volume.",
    scale: [
      ["VEI 4", "≥ 0.1 km³ tephra"],
      ["VEI 5", "≥ 1 km³ (St Helens 1980)"],
      ["VEI 6", "≥ 10 km³ (Pinatubo 1991)"],
    ],
    see: ["last-eruption"],
    dive: "volcano-eruptions",
    source: "Smithsonian GVP",
  },
  "weekly-report": {
    term: "Weekly report",
    area: "volcanoes",
    short:
      "The Smithsonian/USGS Weekly Volcanic Activity Report: new and ongoing activity worldwide, issued Wednesdays.",
    long: "It covers volcanoes no agency on the desk monitors. The panel shows the latest item for the volcano and links the full report.",
    see: ["alert-level"],
    dive: "volcano-status",
    source: "Smithsonian GVP and USGS",
  },
  // ---- Space ----
  ap: {
    term: "Ap",
    area: "space",
    short:
      "The daily planetary amplitude index: the mean of the day's eight ap values, a linear form of Kp, in units of about 2 nT.",
    long: "Kp is quasi-logarithmic and cannot be averaged; ap can. Ap above 30 is a minor storm day, above 100 a severe one. The long history carries it back to 1932.",
    see: ["kp"],
    dive: "space-history",
    source: "GFZ Potsdam",
  },
  aia: {
    term: "AIA channels",
    area: "space",
    short:
      "SDO's extreme-ultraviolet images by wavelength: 171 Å coronal loops, 193 Å the corona and coronal holes, 304 Å the chromosphere.",
    long: "Each channel sees plasma at a different temperature: 171 Å about 0.6 MK, 193 Å about 1.5 MK, 304 Å about 50,000 K. Coronal holes, the sources of fast wind, are dark at 193 Å.",
    see: ["hmi", "lasco"],
    dive: "space-sun",
    source: "NASA SDO",
  },
  aurora: {
    term: "Aurora oval",
    area: "space",
    short:
      "OVATION Prime's probability of seeing aurora overhead, from the solar wind at L1, about 30 to 90 minutes ahead.",
    long: "The desk keeps 72 hours of frames and draws bands at 10, 30, 50, 70 and 90%. Aurora can be seen up to several hundred kilometres equatorward of the oval, low on the horizon.",
    see: ["hemispheric-power", "kp", "bz"],
    dive: "space-aurora",
    source: "NOAA SWPC",
  },
  bt: {
    term: "Bt",
    area: "space",
    short: "The total strength of the interplanetary magnetic field at L1, in nT.",
    long: "The magnitude of the field whose north–south part is Bz. A strong field turned southward is what drives storms; a strong field pointing north does little.",
    see: ["bz", "l1"],
    dive: "space-stack",
  },
  bz: {
    term: "Bz (GSM)",
    area: "space",
    short:
      "The north–south component of the interplanetary magnetic field at L1, in nT; southward (negative) drives storms.",
    long: "A southward field reconnects with the dayside magnetopause and loads the magnetotail; hours below about −10 nT usually come before a storm. The stack draws Bz in red over Bt in grey.",
    see: ["bt", "gsm", "dst", "kp"],
    dive: "space-stack",
    source: "NOAA SWPC real-time solar wind",
  },
  cme: {
    term: "Coronal mass ejection",
    area: "space",
    short:
      "A cloud of magnetised plasma thrown off the Sun; aimed at Earth, it arrives in one to four days.",
    long: "Seen leaving the Sun in the LASCO coronagraphs, a full halo when it heads toward or away from Earth. Its arrival shows at L1 as a jump in speed, density and field, and a southward field inside it makes the strongest storms.",
    see: ["lasco", "bz", "kp"],
    dive: "space-sun",
  },
  dst: {
    term: "Dst",
    area: "space",
    short:
      "The hourly depression of the horizontal field at low latitudes, in nT: a measure of the ring current.",
    long: "From four low-latitude observatories, published by WDC Kyoto; the desk holds it from 1957. Long windows plot the minimum in each bucket.",
    scale: [
      ["−50 nT", "moderate storm"],
      ["−100 nT", "intense storm"],
      ["−250 nT", "severe (March 1989: −589)"],
    ],
    see: ["kp", "bz"],
    dive: "space-history",
    source: "WDC for Geomagnetism, Kyoto",
  },
  f107: {
    term: "F10.7",
    area: "space",
    short:
      "The Sun's radio flux at 10.7 cm (2800 MHz), in solar flux units: a daily proxy for EUV output, from about 65 to over 300.",
    long: "Measured at Penticton, Canada, since 1947. It tracks the sunspot number closely and drives thermospheric density, so satellite drag rises with it.",
    see: ["sunspot-number", "solar-cycle"],
    dive: "space-history",
    source: "NRC Canada via GFZ",
  },
  flare: {
    term: "Flare",
    area: "space",
    short:
      "A sudden release of magnetic energy in an active region, seen as a burst of X-rays; classed by GOES peak flux.",
    long: "The X-rays reach Earth in eight minutes and ionise the dayside ionosphere, causing radio blackouts. The flares list frames any flare in the stack.",
    see: ["goes-class", "noaa-scales"],
    dive: "space-flares",
  },
  "goes-class": {
    term: "GOES X-ray class",
    area: "space",
    short:
      "A flare's peak 0.1–0.8 nm X-ray flux at GOES: A, B, C, M, X, each class ten times the last.",
    long: "The letter gives the decade and the number the multiple, so M5 is 5 × 10⁻⁵ W m⁻². The radio blackout scale follows the class.",
    scale: [
      ["C1", "10⁻⁶ W m⁻²"],
      ["M1", "10⁻⁵ · R1"],
      ["X1", "10⁻⁴ · R3"],
    ],
    see: ["flare", "noaa-scales"],
    dive: "space-flares",
    source: "NOAA GOES",
  },
  gsm: {
    term: "GSM coordinates",
    area: "space",
    short:
      "Geocentric solar magnetospheric: x toward the Sun, z the projection of Earth's dipole axis on the plane normal to x.",
    long: "The frame in which a southward Bz means coupling with Earth's field. It rocks with the dipole through the day and the year.",
    see: ["bz"],
    dive: "space-stack",
  },
  "hemispheric-power": {
    term: "Hemispheric power",
    area: "space",
    short: "OVATION's estimate of the energy precipitating into one auroral zone, in gigawatts.",
    long: "Quiet is below about 20 GW; storms reach 100 GW and more. The stack plots north and south at their forecast time.",
    see: ["aurora"],
    dive: "space-aurora",
    source: "NOAA SWPC",
  },
  hmi: {
    term: "HMI",
    area: "space",
    short:
      "SDO's visible-light imager: the intensitygram (sunspots) and the magnetogram (line-of-sight field, white and black polarities).",
    long: "The magnetogram shows the bipolar active regions that produce flares; complex, mixed regions flare most.",
    see: ["aia", "sunspot-number"],
    dive: "space-sun",
    source: "NASA SDO",
  },
  kp: {
    term: "Kp",
    area: "space",
    short: "The planetary 3-hour geomagnetic activity index, 0 to 9 in thirds; Kp 5 is a G1 storm.",
    long: "Quasi-logarithmic, built from the K indices of 13 subauroral observatories. The tiles show SWPC's estimate; the long history uses GFZ's definitive Kp, dashed while preliminary.",
    scale: [
      ["Kp 5", "G1 minor"],
      ["Kp 7", "G3 strong"],
      ["Kp 9", "G5 extreme"],
    ],
    see: ["ap", "dst", "noaa-scales"],
    dive: "space-stack",
    source: "GFZ Potsdam · NOAA SWPC",
  },
  l1: {
    term: "L1",
    area: "space",
    short:
      "The Sun–Earth Lagrange point 1.5 million km sunward, where DSCOVR and ACE measure the solar wind.",
    long: "At 400 km/s the wind takes about an hour from L1 to Earth, which is the warning the stack's solar wind rows give.",
    see: ["solar-wind", "bz"],
    dive: "space-stack",
  },
  lasco: {
    term: "LASCO C2 and C3",
    area: "space",
    short:
      "SOHO's coronagraphs, blocking the Sun's disc to show the outer corona: C2 to 6 and C3 to 30 solar radii.",
    long: "Where coronal mass ejections are first seen leaving the Sun.",
    see: ["cme", "aia"],
    dive: "space-sun",
    source: "ESA/NASA SOHO",
  },
  "noaa-scales": {
    term: "NOAA scales (G, S, R)",
    area: "space",
    short:
      "NOAA's 1 to 5 scales for geomagnetic storms (G, from Kp), solar radiation storms (S, from protons) and radio blackouts (R, from X-rays).",
    long: "The tile shows the highest of today's observed levels and the forecast.",
    scale: [
      ["G1 / G5", "Kp 5 / Kp 9"],
      ["S1 / S5", "10 / 10⁵ pfu ≥ 10 MeV"],
      ["R1 / R5", "M1 / X20"],
    ],
    see: ["kp", "protons", "goes-class"],
    dive: "space-tiles",
    source: "NOAA SWPC",
  },
  protons: {
    term: "Proton flux",
    area: "space",
    short:
      "Energetic protons at GOES above 10 and 100 MeV, in particle flux units (pfu); 10 pfu ≥ 10 MeV is an S1 storm.",
    long: "Accelerated by flares and CME shocks, they arrive within minutes to hours. They raise radiation doses at high latitudes and altitudes and cause polar cap absorption of HF radio.",
    see: ["noaa-scales", "cme"],
    dive: "space-stack",
    source: "NOAA GOES",
  },
  "solar-cycle": {
    term: "Solar cycle",
    area: "space",
    short: "The roughly 11-year rise and fall of solar activity; cycle 25 began in December 2019.",
    long: "The long history marks each minimum. Large storms can come at any phase, but are commonest in the years around and just after maximum.",
    see: ["sunspot-number", "f107"],
    dive: "space-history",
  },
  "solar-wind": {
    term: "Solar wind speed and density",
    area: "space",
    short:
      "The plasma streaming from the Sun, measured at L1: typically 300 to 800 km/s and 1 to 10 protons per cm³.",
    long: "Fast wind comes from coronal holes; a sudden jump in both is a shock, often a CME arriving.",
    see: ["l1", "bz", "cme"],
    dive: "space-stack",
    source: "NOAA SWPC",
  },
  "sunspot-number": {
    term: "Sunspot number",
    area: "space",
    short:
      "The international sunspot number (SILSO, version 2), daily: the standard index of solar activity.",
    long: "Counts groups and individual spots across a network of observers. The long history carries it from 1932.",
    see: ["f107", "solar-cycle"],
    dive: "space-history",
    source: "SILSO, Royal Observatory of Belgium, via GFZ",
  },
  "swpc-alert": {
    term: "SWPC alert",
    area: "space",
    short:
      "A watch, warning, alert or summary NOAA SWPC issues when a threshold is forecast or crossed.",
    long: "Each card opens to the full message. Alerts are short-lived: what one said six hours ago may already be over.",
    see: ["noaa-scales"],
    dive: "space-flares",
    source: "NOAA SWPC",
  },
  // ---- Maps and fields ----
  chord: {
    term: "Chord",
    area: "maps",
    short:
      "Measure's straight line through the Earth between two points, with its dip at the ends and the deepest layer it reaches.",
    long: "For an angular distance Δ the chord is 2R sin(Δ/2) long, dips Δ/2 at each end, and reaches a depth of R(1 − cos(Δ/2)) at its middle; PREM names the layer there.",
    see: ["prem", "great-circle"],
    dive: "map-measure",
  },
  corridor: {
    term: "Corridor",
    area: "maps",
    short:
      "The band either side of a cross-section's line from which events are projected onto it.",
    long: "Its half-width is set in the profile's title. A wide corridor gathers more events but smears structure that changes along strike.",
    see: ["cross-section"],
    dive: "map-section",
  },
  "cross-section": {
    term: "Cross-section",
    area: "maps",
    short:
      "Depth against distance along a great circle from A to A′, with every event in the corridor projected onto it.",
    long: "True scale by default, ×2 or ×4 to stretch depth; the relief along the line is drawn above sea level and the sea floor below. It survives page and region changes.",
    see: ["corridor", "relief", "great-circle"],
    dive: "map-section",
  },
  "density-grid": {
    term: "Density grid",
    area: "maps",
    short:
      "Shaded cells counting the events of the window, drawn when the list is cut at a raised floor.",
    long: "Each cell counts events at the requested floor, so the map still shows where the small ones are when only the large are listed as markers.",
    see: ["floor"],
    dive: "map-density",
  },
  "free-air": {
    term: "Free-air anomaly",
    area: "maps",
    short:
      "Observed gravity minus normal gravity, corrected only for the height of the observation, in mGal.",
    long: "The Field select's gravity layer on the world maps (Sandwell 2019, from satellite altimetry at sea). It follows topography and bathymetry closely: trenches are deep lows, seamounts highs.",
    see: ["isostatic", "magnetic-anomaly"],
    dive: "map-fields",
    source: "Sandwell et al. 2019",
  },
  "great-circle": {
    term: "Great circle",
    area: "maps",
    short: "The shortest path between two points on the sphere; sections and measures follow it.",
    long: "It looks curved on most map projections. Distances on the desk use a sphere of radius 6371 km.",
    see: ["cross-section", "chord"],
    dive: "map-measure",
  },
  isostatic: {
    term: "Isostatic residual anomaly",
    area: "maps",
    short:
      "Bouguer gravity with the effect of an isostatic root removed, which leaves the density contrasts of the upper crust.",
    long: "The gravity layer in the West Coast view, from USGS DDS-9. It brings out basins (lows) and dense intrusive and ophiolite bodies (highs).",
    see: ["free-air"],
    dive: "map-fields",
    source: "USGS DDS-9",
  },
  "magnetic-anomaly": {
    term: "Magnetic anomaly",
    area: "maps",
    short:
      "The crustal part of the magnetic field, in nT, after the core field is removed; EMAG2 at 4 km above the geoid.",
    long: "Seafloor stripes record reversals; on land it maps magnetite-rich bodies and the depth to them. The desk's colour ramp is equalised.",
    see: ["free-air"],
    dive: "map-fields",
    source: "Meyer et al. 2017 (EMAG2v3)",
  },
  "plate-boundaries": {
    term: "Plate boundaries",
    area: "maps",
    short: "Bird's (2003) PB2002 model: 52 plates and their boundaries, typed by motion.",
    long: "Subduction zones carry teeth on the overriding plate; other boundaries are drawn plain. Hovering a boundary names it.",
    see: ["qfaults"],
    dive: "map-layers",
    source: "Bird 2003",
  },
  prem: {
    term: "PREM",
    area: "maps",
    short:
      "The Preliminary Reference Earth Model (Dziewonski and Anderson 1981): the standard radial profile of Earth's layers.",
    long: "Measure names the PREM layer at the deepest point of a chord: crust, upper mantle, transition zone, lower mantle, outer or inner core.",
    see: ["chord"],
    dive: "map-measure",
  },
  qfaults: {
    term: "Quaternary faults",
    area: "maps",
    short:
      "Faults and folds with evidence of movement in the last 1.6 million years, from the USGS Quaternary Fault and Fold Database.",
    long: "West Coast view only, coloured by the age of the latest movement and dashed by how well located the trace is. Hovering names the fault section, its slip rate and sense.",
    scale: [
      ["Historic", "< 150 yr"],
      ["Latest Quaternary", "< 15 ka"],
      ["Late Quaternary", "< 130 ka"],
    ],
    see: ["plate-boundaries"],
    dive: "map-layers",
    source: "USGS",
  },
  relief: {
    term: "Relief",
    area: "maps",
    short:
      "Height and depth along a cross-section from SRTM15+ (Tozer 2019), sampled on a 3′ grid.",
    long: "Drawn above the section's events with land and water filled along sea level.",
    see: ["cross-section"],
    dive: "map-section",
    source: "Tozer et al. 2019",
  },
  // ---- The desk ----
  animate: {
    term: "Animate",
    area: "desk",
    short:
      "Replays the window's events in order, a day, month or year a step, as the window's length suits.",
    long: "Markers appear as their time comes and fade; the strip under the map scrubs and sets the speed.",
    see: ["window"],
    dive: "map-animate",
  },
  bowl: {
    term: "Bowl",
    area: "desk",
    short:
      "The event panel's beachball drawn as the inside of the lower focal sphere: opens tilted, settles flat.",
    long: "Settings → Beachball. It opens tilted 30° from the south and eases to 0°, where it is the equal-area plot exactly; the slider tilts it ±60°. An axis hidden behind the near rim is a dashed ring.",
    see: ["beachball"],
    dive: "mechanism",
  },
  compare: {
    term: "Compare",
    area: "desk",
    short: "Marks set out pairwise: the time apart, ΔM, Δdepth and distance between each two.",
    long: "A staircase of cards read from the left node to the top node.",
    see: ["marks"],
    dive: "marks-compare",
  },
  "deep-dive": {
    term: "Deep dive",
    area: "desk",
    short:
      "A tour of one part of the desk, control by control, on a real example; filed in the Field manual.",
    long: "Each gives your view back when it ends. A ◆ on a part of the desk lists its deep dives.",
    see: ["window"],
    dive: "settings",
  },
  floor: {
    term: "Floor",
    area: "desk",
    short: "The lowest magnitude the map lists in the window in force.",
    long: "For long windows the desk raises it to M5, M6 or M7 so the list stays within 2,000 events, and shades the rest as a density grid. The status line says when it is raised.",
    see: ["window", "density-grid", "mc"],
    dive: "map-density",
  },
  marks: {
    term: "Marks",
    area: "desk",
    short: "Events and volcanoes you keep to come back to, in groups, kept in this browser.",
    long: "Open a mark's view, stack the panels of a group, compare them pairwise, or export them to a file for another browser.",
    see: ["compare"],
    dive: "marks-groups",
  },
  pin: {
    term: "Pin",
    area: "desk",
    short: "One point of your own on each map view, named and kept in this browser.",
    long: "Hold it to move it; the bar keeps the recent ones.",
    dive: "map-pin",
  },
  region: {
    term: "Region",
    area: "desk",
    short: "The part of the world a page shows: global or a regional view such as the West Coast.",
    long: "Each region has its own default floor; some layers (Quaternary faults, the isostatic gravity) exist only in the West Coast view.",
    see: ["floor", "window"],
    dive: "map-nav",
  },
  theater: {
    term: "Theater mode",
    area: "desk",
    short: "The map filling the window under the toolbar; the corner button or Escape leaves it.",
    long: "The map is unlocked for the time, so one finger pans it.",
    dive: "map-nav",
  },
  window: {
    term: "Window",
    area: "desk",
    short: "The span of time a page shows: a preset such as 7 days, or a from–to range.",
    long: "Set in the refine bar. Every count, chart and map on the page reads from it.",
    see: ["floor", "region"],
    dive: "refine-quakes",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;

/** The chapter id, and the hash an entry has inside it: `#glossary/<id>`. */
export const GLOSSARY_CHAPTER = "glossary";

/** Whether the glossary holds an entry by this id. */
export const isTermId = (id: string): id is TermId => Object.hasOwn(GLOSSARY, id);

export type GlossaryItem = GlossaryEntry & { id: TermId };

/** The entry for an id, or null for one the glossary does not hold. */
export function termById(id: string): GlossaryItem | null {
  return isTermId(id) ? { ...GLOSSARY[id], id } : null;
}

/** Every entry with its id, A to Z by term. */
export const GLOSSARY_LIST: readonly GlossaryItem[] = Object.keys(GLOSSARY)
  .filter(isTermId)
  .map((id): GlossaryItem => ({ ...GLOSSARY[id], id }))
  .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));

/** The entries in an area (or all) whose term or line holds `query`, any case. */
export function filterGlossary(query: string, area: GlossaryArea | null): GlossaryItem[] {
  const q = query.trim().toLowerCase();
  return GLOSSARY_LIST.filter(
    (e) =>
      (area === null || e.area === area) &&
      (q === "" || `${e.term} ${e.short}`.toLowerCase().includes(q)),
  );
}

/** The letter an entry files under. */
export const letterOf = (e: Pick<GlossaryEntry, "term">): string => e.term.charAt(0).toUpperCase();

/** How a reader opens an entry from a linked term on the desk. */
export type GlossaryOpen = "dblclick" | "click" | "off";

/** The line a term's hint ends with, saying how to open its entry. */
export function howToOpen(mode: GlossaryOpen): string {
  if (mode === "dblclick") return "Double-click for the glossary";
  if (mode === "click") return "Click for the glossary";
  return "";
}

/** The event a linked term sends up the page to open its entry; its detail is the term id. */
export const TERM_OPEN_EVENT = "glossary-open";
