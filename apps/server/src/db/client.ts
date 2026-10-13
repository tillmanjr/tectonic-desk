import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/** Accepts both the pool-backed database and a transaction inside it. */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}
