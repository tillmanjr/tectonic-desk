import { z } from "zod";

/**
 * Shapes of the SWPC JSON files, as loosely as the sources deserve: extra fields pass
 * through, the ones we read are checked. Numbers may be null in any row.
 */

const num = z.number().nullable().optional();
const optionalText = z.string().nullable().optional();

/** `json/planetary_k_index_1m.json`: the 1-minute estimated Kp, last six hours. */
export const kp1mSchema = z.array(z.looseObject({ time_tag: z.string(), estimated_kp: num }));
export type Kp1mRow = z.infer<typeof kp1mSchema>[number];

/** `products/noaa-planetary-k-index.json`: 3-hour Kp, seven days. */
export const kp3hSchema = z.array(z.looseObject({ time_tag: z.string(), Kp: num }));
export type Kp3hRow = z.infer<typeof kp3hSchema>[number];

/** `products/noaa-planetary-k-index-forecast.json`: 3-hour Kp observed, estimated and predicted to D+3. */
export const kpForecastSchema = z.array(
  z.looseObject({ time_tag: z.string(), kp: num, observed: z.string() }),
);
export type KpForecastRow = z.infer<typeof kpForecastSchema>[number];

/** `products/kyoto-dst.json`: hourly provisional Dst, seven days. */
export const dstSchema = z.array(z.looseObject({ time_tag: z.string(), dst: num }));
export type DstRow = z.infer<typeof dstSchema>[number];

/** `json/rtsw/rtsw_mag_1m.json`: one row per spacecraft per minute, newest first. */
export const magSchema = z.array(
  z.looseObject({
    time_tag: z.string(),
    active: z.boolean(),
    source: z.string(),
    bt: num,
    bz_gsm: num,
  }),
);
export type MagRow = z.infer<typeof magSchema>[number];

/** `json/rtsw/rtsw_wind_1m.json`: plasma per spacecraft per minute. */
export const windSchema = z.array(
  z.looseObject({
    time_tag: z.string(),
    active: z.boolean(),
    source: z.string(),
    proton_speed: num,
    proton_density: num,
  }),
);
export type WindRow = z.infer<typeof windSchema>[number];

/** `json/goes/primary/xrays-6-hour.json` and `integral-protons-6-hour.json`: one row per channel per step. */
export const goesFluxSchema = z.array(
  z.looseObject({
    time_tag: z.string(),
    satellite: z.number().int(),
    flux: num,
    energy: z.string(),
  }),
);
export type GoesFluxRow = z.infer<typeof goesFluxSchema>[number];

/** `json/goes/primary/xray-flares-7-day.json`. */
export const flaresSchema = z.array(
  z.looseObject({
    begin_time: z.string(),
    max_time: optionalText,
    end_time: optionalText,
    begin_class: optionalText,
    max_class: optionalText,
    end_class: optionalText,
    max_xrlong: num,
    satellite: z.number().int().nullable().optional(),
  }),
);
export type FlareRow = z.infer<typeof flaresSchema>[number];

/** `products/alerts.json`: the most recent alerts, warnings, watches and summaries. */
export const alertsSchema = z.array(
  z.looseObject({ product_id: z.string(), issue_datetime: z.string(), message: z.string() }),
);
export type AlertRow = z.infer<typeof alertsSchema>[number];

/** One day of `products/noaa-scales.json`; levels and probabilities are strings or null. */
const scalesEntrySchema = z.looseObject({
  DateStamp: z.string(),
  TimeStamp: z.string(),
  R: z.looseObject({ Scale: optionalText, MinorProb: optionalText, MajorProb: optionalText }),
  S: z.looseObject({ Scale: optionalText, Prob: optionalText }),
  G: z.looseObject({ Scale: optionalText }),
});
/** Keys `-1` (yesterday), `0` (today) observed; `1`..`3` predicted. */
export const scalesSchema = z.record(z.string(), scalesEntrySchema);
export type ScalesDoc = z.infer<typeof scalesSchema>;
export type ScalesEntry = z.infer<typeof scalesEntrySchema>;
