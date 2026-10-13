import type { Db } from "../db/client.js";
import type { UsgsClient } from "../usgs/client.js";

export type LogFn = (obj: object, msg?: string) => void;

export interface IngestLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export interface IngestContext {
  db: Db;
  usgs: UsgsClient;
  log: IngestLogger;
  now: () => Date;
}
