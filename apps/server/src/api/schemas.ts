import type { BBox, SummaryBy } from "@tectonic/shared";
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

const eventsFilterSchema = z.strictObject({
  since: isoDate.optional(),
  until: isoDate.optional(),
  minMag: z.coerce.number().min(-2).max(10).optional(),
  bbox: bboxString.optional(),
});

const eventsQuerySchema = eventsFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

export const summaryBySchema = z.enum(["day", "month", "year"]);
const summaryQuerySchema = eventsFilterSchema.extend({ by: summaryBySchema.optional() });

/** Grid cell sizes in degrees; a fixed set keeps the query cacheable. */
export const GRID_CELLS = [0.25, 0.5, 1, 2, 5] as const;
const gridQuerySchema = eventsFilterSchema.extend({
  cell: z.coerce
    .number()
    .refine((c) => GRID_CELLS.some((g) => g === c), {
      message: `cell must be one of ${GRID_CELLS.join(", ")}`,
    })
    .default(1),
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

export interface EventsFilter {
  since: Date;
  until: Date | null;
  minMag: number | null;
  bbox: BBox | null;
}

export interface EventsQuery extends EventsFilter {
  limit: number;
}

type RawFilter = z.output<typeof eventsFilterSchema>;

/** Applies the defaults: since = now - 7 days; until must not precede since. */
function resolveFilter(q: RawFilter, now: Date): EventsFilter {
  const since = q.since ?? new Date(now.getTime() - DEFAULT_WINDOW_MS);
  const until = q.until ?? null;
  if (until && until.getTime() < since.getTime()) {
    throw badRequest([{ path: "until", message: "until must not precede since" }]);
  }
  return { since, until, minMag: q.minMag ?? null, bbox: q.bbox ?? null };
}

/** The list filters without a limit, for the aggregate routes. */
export function parseEventsFilter(input: unknown, now: Date): EventsFilter {
  return resolveFilter(parseOrThrow(eventsFilterSchema, input), now);
}

/** Parses the list query and applies defaults: since = now - 7 days. */
export function parseEventsQuery(input: unknown, now: Date): EventsQuery {
  const q = parseOrThrow(eventsQuerySchema, input);
  return { ...resolveFilter(q, now), limit: q.limit };
}

const DAY_MS = 86_400_000;

/** Day bins up to 120 days, month bins up to 15 years, year bins beyond. */
export function defaultSummaryBy(f: EventsFilter, now: Date): SummaryBy {
  const span = (f.until ?? now).getTime() - f.since.getTime();
  if (span <= 120 * DAY_MS) return "day";
  if (span <= 15 * 365.25 * DAY_MS) return "month";
  return "year";
}

export function parseSummaryQuery(input: unknown, now: Date): EventsFilter & { by: SummaryBy } {
  const q = parseOrThrow(summaryQuerySchema, input);
  const filter = resolveFilter(q, now);
  return { ...filter, by: q.by ?? defaultSummaryBy(filter, now) };
}

export function parseGridQuery(input: unknown, now: Date): EventsFilter & { cell: number } {
  const q = parseOrThrow(gridQuerySchema, input);
  return { ...resolveFilter(q, now), cell: q.cell };
}

export function toListFilter(q: EventsFilter & { limit?: number }): ListEventsFilter {
  const filter: ListEventsFilter = { since: q.since };
  if (q.limit !== undefined) filter.limit = q.limit;
  if (q.until) filter.until = q.until;
  if (q.minMag !== null) filter.minMag = q.minMag;
  if (q.bbox) filter.bbox = q.bbox;
  return filter;
}

/** Four comma-separated numbers: lon, lat, lon, lat. */
const fourNumbers = z
  .string()
  .transform((v, ctx) => {
    const parts = v.split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: "custom", message: "expected lon,lat,lon,lat" });
      return z.NEVER;
    }
    return parts;
  })
  .pipe(z.tuple([lon, lat, lon, lat]));

/** `GET /api/relief`: the section's ends and how many samples to take along it. */
export const reliefQuerySchema = z.strictObject({
  section: fourNumbers,
  n: z.coerce.number().int().min(2).max(1024).default(256),
});

const isoInstant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** `GET /api/space/window`: two instants, `to` defaulting to now. */
export const spaceWindowQuerySchema = z.strictObject({
  from: isoInstant,
  to: isoInstant.optional(),
});

/** The longest window the route serves. */
export const SPACE_WINDOW_MAX_MS = 93 * DAY_MS;
/** Windows up to this long come back as the stored rows; longer ones are thinned. */
export const SPACE_RAW_MAX_MS = 25 * 3_600_000;
/** How many points per series a thinned window carries, at most. */
export const SPACE_POINTS = 1500;

/** Seconds per bucket for a window: null (raw rows) up to 25 hours, else the span over 1,500 points rounded up to a whole minute. */
export function bucketFor(from: Date, to: Date): number | null {
  const span = to.getTime() - from.getTime();
  if (span <= SPACE_RAW_MAX_MS) return null;
  return Math.ceil(span / 1000 / SPACE_POINTS / 60) * 60;
}

export interface SpaceWindowQuery {
  from: Date;
  to: Date;
  bucketSeconds: number | null;
}

export function parseSpaceWindow(input: unknown, now: Date): SpaceWindowQuery {
  const q = parseOrThrow(spaceWindowQuerySchema, input);
  const to = q.to ?? now;
  if (to.getTime() < q.from.getTime()) {
    throw badRequest([{ path: "to", message: "to must not precede from" }]);
  }
  if (to.getTime() - q.from.getTime() > SPACE_WINDOW_MAX_MS) {
    throw badRequest([{ path: "to", message: "window must not exceed 93 days" }]);
  }
  return { from: q.from, to, bucketSeconds: bucketFor(q.from, to) };
}
