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

/** The part of a pool that `drainPool` needs; `pg.Pool` satisfies it. */
export interface DrainablePool {
  readonly totalCount: number;
  end: () => Promise<void>;
  on: (event: "remove", listener: () => void) => unknown;
}

/**
 * Ends the pool and waits until every connection it held has actually closed. `pool.end()`
 * resolves as soon as the clients are dropped from the pool, while their terminate messages are
 * still on the wire; stopping Postgres in that gap (a test container, a shutdown) has it answer
 * the open sockets with a FATAL "terminating connection due to administrator command", which
 * the pool, by then without an error listener, raises as an uncaught exception.
 */
export async function drainPool(pool: DrainablePool): Promise<void> {
  let left = pool.totalCount;
  const closed = new Promise<void>((resolve) => {
    if (left === 0) resolve();
    pool.on("remove", () => {
      left -= 1;
      if (left === 0) resolve();
    });
  });
  await pool.end();
  await closed;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => drainPool(pool) };
}
