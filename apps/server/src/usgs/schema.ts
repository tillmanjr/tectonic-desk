import { z } from "zod";

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const featureSchema = z.object({
  id: z.string(),
  properties: z
    .object({
      mag: nullableNumber,
      place: nullableString,
      time: z.number(),
      updated: z.number(),
      felt: nullableNumber,
      cdi: nullableNumber,
      mmi: nullableNumber,
      alert: nullableString,
      status: nullableString,
      tsunami: nullableNumber,
      sig: nullableNumber,
      net: nullableString,
      types: nullableString,
      magType: nullableString,
      type: nullableString,
    })
    .loose(),
  geometry: z.object({ coordinates: z.array(z.number().nullable()) }).loose(),
});
export type Feature = z.infer<typeof featureSchema>;

export const feedDocumentSchema = z.object({ features: z.array(z.unknown()) }).loose();
export type FeedDocument = z.infer<typeof feedDocumentSchema>;

export const productSchema = z
  .object({
    source: z.string(),
    code: z.string(),
    status: z.string(),
    updateTime: z.number(),
    preferredWeight: z.number().optional(),
    properties: z.record(z.string(), z.string()),
  })
  .loose();
export type Product = z.infer<typeof productSchema>;

export const detailDocumentSchema = featureSchema.extend({
  properties: featureSchema.shape.properties.extend({
    products: z.record(z.string(), z.array(z.unknown())).optional(),
  }),
});
export type DetailDocument = z.infer<typeof detailDocumentSchema>;
