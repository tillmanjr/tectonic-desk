/**
 * Space weather as the desk stores it: a few numeric series sampled by NOAA SWPC's feeds,
 * plus the flares, alerts and daily NOAA scales that are records rather than samples.
 */

/** The series the server stores; adding one is a new id, not a migration. */
export const SPACE_SERIES = [
  /** SWPC's 1-minute estimated planetary K index (revises until its 3-hour window closes). */
  "kp_1m",
  /** SWPC's 3-hour planetary K index. */
  "kp_3h",
  /** Kyoto provisional Dst, nT, hourly. */
  "dst",
  /** Solar wind Bz in GSM coordinates, nT, from the active spacecraft at L1. */
  "bz_gsm",
  /** Solar wind total field, nT. */
  "bt",
  /** Solar wind proton speed, km/s. */
  "speed",
  /** Solar wind proton density, per cm³. */
  "density",
  /** GOES 0.1–0.8 nm X-ray flux, W/m². */
  "xray_long",
  /** GOES 0.05–0.4 nm X-ray flux, W/m². */
  "xray_short",
  /** GOES integral proton flux at or above 10 MeV, pfu. */
  "p10",
  /** GOES integral proton flux at or above 100 MeV, pfu. */
  "p100",
] as const;
export type SpaceSeries = (typeof SPACE_SERIES)[number];

export const isSpaceSeries = (s: string): s is SpaceSeries =>
  SPACE_SERIES.some((id) => id === s);

/** One measurement of one series from one instrument or agency. */
export interface SpaceSample {
  series: SpaceSeries;
  time: Date;
  /** The spacecraft (`SOLAR1`, `ACE`, `IMAP`), satellite (`GOES-18`) or agency (`swpc`, `kyoto`). */
  source: string;
  value: number;
}

/** A GOES X-ray flare as SWPC lists it; the end fields arrive after the begin. */
export interface SpaceFlare {
  beginTime: Date;
  maxTime: Date | null;
  endTime: Date | null;
  beginClass: string | null;
  maxClass: string | null;
  endClass: string | null;
  /** Peak 0.1–0.8 nm flux, W/m². */
  maxXrlong: number | null;
  satellite: number | null;
}

/** A SWPC alert, warning, watch or summary; the message is the full NWS text. */
export interface SpaceAlert {
  /** SWPC product code, e.g. `K05W`, `XM5A`. */
  productId: string;
  issueTime: Date;
  message: string;
}

export type ScalesKind = "observed" | "predicted";

/** NOAA scales for one UTC day: observed levels, or a predicted G level with R and S probabilities. */
export interface SpaceScales {
  day: Date;
  kind: ScalesKind;
  issued: Date;
  r: number | null;
  s: number | null;
  g: number | null;
  /** Percent chance of R1–R2, R3+ and S1+ on a predicted day. */
  rMinorProb: number | null;
  rMajorProb: number | null;
  sProb: number | null;
  /** The day's largest 3-hour Kp, observed or predicted. */
  kpMax: number | null;
}
