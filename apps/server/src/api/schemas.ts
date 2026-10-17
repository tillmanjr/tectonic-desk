import type { BBox } from "@tectonic/shared";
import { z } from "zod";
import type { ListEventsFilter } from "../repositories/events.js";
import { RUN_KINDS } from "../repositories/ingest-runs.js";
import { badRequest } from "./errors.js";

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isoDate = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((s) => new Date(s));

const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

/** `minLon,minLat,maxLon,maxLat`; minLon > maxLon crosses the antimeridian. */
export const bboxString = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([lon, lat, lon, lat]))
  .transform(([minLon, minLat, maxLon, maxLat]): BBox => ({ minLon, minLat, maxLon, maxLat }))
  .refine((b) => b.minLat <= b.maxLat, { message: "minLat must not exceed maxLat" });

const eventsQuerySchema = z.object({
  since: isoDate.optional(),
  until: isoDate.optional(),
  minMag: z.coerce.number().min(-2).max(10).optional(),
  bbox: bboxString.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

export const runsQuerySchema = z.object({
  kind: z.enum(RUN_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const eventIdSchema = z.object({ id: z.string().min(1).max(64) });

export const volcanoChangesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export const volcanoReportsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(26).default(4),
});

/** A GVP volcano number: a positive integer in the path. */
export const volcanoNumberSchema = z.object({
  number: z.coerce.number().int().positive(),
});

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest(
      result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return result.data;
}

export interface EventsQuery {
  since: Date;
  until: Date | null;
  minMag: number | null;
  bbox: BBox | null;
  limit: number;
}

/** Parses the list query and applies defaults: since = now - 7 days. */
export function parseEventsQuery(input: unknown, now: Date): EventsQuery {
  const q = parseOrThrow(eventsQuerySchema, input);
  const since = q.since ?? new Date(now.getTime() - DEFAULT_WINDOW_MS);
  const until = q.until ?? null;
  if (until && until.getTime() < since.getTime()) {
    throw badRequest([{ path: "until", message: "until must not precede since" }]);
  }
  return { since, until, minMag: q.minMag ?? null, bbox: q.bbox ?? null, limit: q.limit };
}

export function toListFilter(q: EventsQuery): ListEventsFilter {
  const filter: ListEventsFilter = { since: q.since, limit: q.limit };
  if (q.until) filter.until = q.until;
  if (q.minMag !== null) filter.minMag = q.minMag;
  if (q.bbox) filter.bbox = q.bbox;
  return filter;
}
