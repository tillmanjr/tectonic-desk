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
  /** OVATION Prime's hemispheric power, GW, stored at the forecast time it applies to: north. */
  "hp_north",
  /** The same for the south. */
  "hp_south",
  /** GFZ Potsdam's planetary Kp, 3-hourly since 1932; source `gfz` once definitive, `gfz-pre` before. */
  "kp_gfz",
  /** GFZ's daily Ap, the linear daily mean of ap, since 1932. */
  "ap",
  /** Daily total sunspot number as GFZ carries it (SILSO), since 1932. */
  "ssn",
  /** Observed 10.7 cm solar radio flux, sfu, daily since 1947. */
  "f107",
] as const;
export type SpaceSeries = (typeof SPACE_SERIES)[number];

export const isSpaceSeries = (s: string): s is SpaceSeries => SPACE_SERIES.some((id) => id === s);

/** A record with one entry per series, filled by a function of the series id. */
export function seriesRecord<T>(fill: (s: SpaceSeries) => T): Record<SpaceSeries, T> {
  return {
    kp_1m: fill("kp_1m"),
    kp_3h: fill("kp_3h"),
    dst: fill("dst"),
    bz_gsm: fill("bz_gsm"),
    bt: fill("bt"),
    speed: fill("speed"),
    density: fill("density"),
    xray_long: fill("xray_long"),
    xray_short: fill("xray_short"),
    p10: fill("p10"),
    p100: fill("p100"),
    hp_north: fill("hp_north"),
    hp_south: fill("hp_south"),
    kp_gfz: fill("kp_gfz"),
    ap: fill("ap"),
    ssn: fill("ssn"),
    f107: fill("f107"),
  };
}

export type SeriesAggregate = "max" | "min" | "mean";

/**
 * How a wide bucket summarises a series. Indices and fluxes keep their peak and Dst and Bz
 * their trough, so a storm survives a 23-day bucket; the rest average.
 */
export const SERIES_AGGREGATE: Record<SpaceSeries, SeriesAggregate> = seriesRecord((s) => {
  if (s === "dst" || s === "bz_gsm") return "min";
  if (s === "bt" || s === "speed" || s === "density" || s === "ssn" || s === "f107") return "mean";
  return "max";
});

/** Maps every entry of a series record. */
export function mapSeries<A, B>(
  rec: Record<SpaceSeries, A>,
  f: (value: A, series: SpaceSeries) => B,
): Record<SpaceSeries, B> {
  return seriesRecord((s) => f(rec[s], s));
}

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

/** OVATION Prime grid: longitudes 0..359 by latitudes -90..90, one percent per cell. */
export const AURORA_WIDTH = 360;
export const AURORA_HEIGHT = 181;
export const AURORA_CELLS = AURORA_WIDTH * AURORA_HEIGHT;
/** Frames are kept this long: the solar wind takes one to three days to arrive. */
export const AURORA_RETENTION_HOURS = 72;
/** Probability bands the web draws, percent. */
export const AURORA_THRESHOLDS = [10, 30, 50, 70, 90] as const;

/** Index of a cell in the grid, in the feed's own order (longitude-major). */
export const auroraIndex = (lon: number, lat: number): number => lon * AURORA_HEIGHT + (lat + 90);

/** One OVATION Prime frame: a probability (0..100) per 1° cell. */
export interface AuroraFrame {
  /** The solar wind observation the run was driven by. */
  observed: Date;
  /** The instant the probabilities are for, 30 to 90 minutes after `observed`. */
  forecast: Date;
  /** Hemispheric power, GW; null when the tabular file has no row for `observed`. */
  powerNorth: number | null;
  powerSouth: number | null;
  grid: Uint8Array;
}
export type AuroraFrameMeta = Omit<AuroraFrame, "grid">;
