import type { Mechanism } from "@tectonic/shared";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { mechanisms } from "../db/schema.js";
import { mechanismToRow } from "../mappers/mechanisms.js";

const excluded = (column: string): SQL => sql.raw(`excluded."${column}"`);

const updateSet = {
  preferred: excluded("preferred"),
  strike1: excluded("strike1"),
  dip1: excluded("dip1"),
  rake1: excluded("rake1"),
  strike2: excluded("strike2"),
  dip2: excluded("dip2"),
  rake2: excluded("rake2"),
  tAzimuth: excluded("t_azimuth"),
  tPlunge: excluded("t_plunge"),
  pAzimuth: excluded("p_azimuth"),
  pPlunge: excluded("p_plunge"),
  nAzimuth: excluded("n_azimuth"),
  nPlunge: excluded("n_plunge"),
  mrr: excluded("mrr"),
  mtt: excluded("mtt"),
  mpp: excluded("mpp"),
  mrt: excluded("mrt"),
  mrp: excluded("mrp"),
  mtp: excluded("mtp"),
  scalarMoment: excluded("scalar_moment"),
  mw: excluded("mw"),
  depthKm: excluded("depth_km"),
  percentDc: excluded("percent_dc"),
  planesReconstructed: excluded("planes_reconstructed"),
  productUpdated: excluded("product_updated"),
  raw: excluded("raw"),
};

/** Inserts a product, or overwrites the row with the same event, kind, source and code. */
export async function upsertMechanism(db: Db, m: Mechanism): Promise<void> {
  await db
    .insert(mechanisms)
    .values(mechanismToRow(m))
    .onConflictDoUpdate({
      target: [mechanisms.eventId, mechanisms.kind, mechanisms.source, mechanisms.code],
      set: updateSet,
    });
}

export type MechanismKey = Pick<Mechanism, "eventId" | "kind" | "source" | "code">;

export async function deleteMechanism(db: Db, key: MechanismKey): Promise<void> {
  await db
    .delete(mechanisms)
    .where(
      and(
        eq(mechanisms.eventId, key.eventId),
        eq(mechanisms.kind, key.kind),
        eq(mechanisms.source, key.source),
        eq(mechanisms.code, key.code),
      ),
    );
}
