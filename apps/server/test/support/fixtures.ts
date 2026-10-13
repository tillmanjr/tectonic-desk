import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { IngestLogger } from "../../src/ingest/context.js";

/** Loads a JSON fixture from test/fixtures/usgs and validates it against the given schema. */
export function loadFixture<T>(name: string, schema: z.ZodType<T>): T {
  const path = fileURLToPath(new URL(`../fixtures/usgs/${name}`, import.meta.url));
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  obj: object;
  msg: string | undefined;
}

export function recordingLogger(): IngestLogger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const at =
    (level: LogEntry["level"]) =>
    (obj: object, msg?: string): void => {
      entries.push({ level, obj, msg });
    };
  return { entries, info: at("info"), warn: at("warn"), error: at("error") };
}
