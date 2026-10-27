import { z } from "zod";

/**
 * Shapes of the two history services. GFZ answers `{ datetime[], <index>[], status[] | <index>status[], meta }`
 * with the index array under its own name (`Kp`, `Ap`, `SN`, `Fobs`) and the status array as
 * `status` for Kp but `Apstatus` and `SNstatus` for the daily indices; Fobs has none. Kyoto's
 * HAPI server describes a dataset with `startDate` and `stopDate` and serves its data as CSV.
 */

export const GFZ_INDEXES = ["Kp", "Ap", "SN", "Fobs"] as const;
export type GfzIndex = (typeof GFZ_INDEXES)[number];

const values = z.array(z.number().nullable());
const statuses = z.array(z.string()).optional();

export const gfzRawSchema = z.looseObject({
  datetime: z.array(z.string()),
  status: statuses,
  Kp: values.optional(),
  Ap: values.optional(),
  Apstatus: statuses,
  SN: values.optional(),
  SNstatus: statuses,
  Fobs: values.optional(),
});
export type GfzRaw = z.infer<typeof gfzRawSchema>;

/** One index's values with their times and, when the service gives them, their statuses. */
export interface GfzDoc {
  index: GfzIndex;
  datetime: string[];
  values: (number | null)[];
  /** `def` or `pre` per value; null when the index carries no status. */
  status: string[] | null;
}

/** Lifts the requested index out of the raw document; the arrays must be present and aligned. */
export function gfzDoc(index: GfzIndex, raw: GfzRaw): GfzDoc {
  const vals = raw[index];
  if (vals === undefined) throw new Error(`GFZ answer lacks ${index}`);
  if (vals.length !== raw.datetime.length) {
    throw new Error(
      `GFZ ${index}: ${String(vals.length)} values for ${String(raw.datetime.length)} times`,
    );
  }
  const status =
    index === "Kp"
      ? raw.status
      : index === "Ap"
        ? raw.Apstatus
        : index === "SN"
          ? raw.SNstatus
          : undefined;
  return { index, datetime: raw.datetime, values: vals, status: status ?? null };
}

/** `GET /hapi/info?id=hour_dst`: the dataset's range; a data request outside it is a 400. */
export const hapiInfoSchema = z.looseObject({ startDate: z.string(), stopDate: z.string() });
export type HapiInfo = z.infer<typeof hapiInfoSchema>;
