import { z } from "zod";

/**
 * Shapes of the live volcano feeds, as loosely as the sources deserve: extra
 * fields pass through, the ones we read are checked.
 */

const optionalText = z.string().nullable().optional();

/** One row of USGS HANS `getMonitoredVolcanoes` / `getElevatedVolcanoes`. */
export const hansRowSchema = z.looseObject({
  volcano_name: z.string(),
  vnum: optionalText,
  volcano_cd: optionalText,
  alert_level: optionalText,
  color_code: optionalText,
  /** "2026-10-16 19:14:32", UTC without a zone marker. */
  sent_utc: optionalText,
  notice_url: optionalText,
  obs_abbr: optionalText,
});
export const hansListSchema = z.array(hansRowSchema);
export type HansRow = z.infer<typeof hansRowSchema>;

/** GeoNet `GET /volcano/val`: a FeatureCollection of the twelve monitored volcanoes. */
export const geonetDocSchema = z.looseObject({
  features: z.array(
    z.looseObject({
      properties: z.looseObject({
        volcanoID: z.string(),
        volcanoTitle: z.string(),
        level: z.number().int(),
        /** Aviation colour code, e.g. "Green". */
        acc: optionalText,
        activity: optionalText,
        hazards: optionalText,
      }),
    }),
  ),
});
export type GeonetDoc = z.infer<typeof geonetDocSchema>;
