import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INGEST_ENABLED: z.stringbool().default(true),
  INGEST_DAY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  INGEST_WEEK_INTERVAL_MS: z.coerce.number().int().min(300_000).default(3_600_000),
  USGS_BASE_URL: z.url().default("https://earthquake.usgs.gov"),
  USGS_USER_AGENT: z.string().min(1).default("tectonic-desk/0.0 (+local)"),
  VOLCANO_STATUS_INTERVAL_MS: z.coerce.number().int().min(60_000).default(900_000),
  VOLCANO_REPORTS_INTERVAL_MS: z.coerce.number().int().min(600_000).default(21_600_000),
  SPACE_ENABLED: z.stringbool().default(true),
  SPACE_FAST_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  SPACE_EVENTS_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  SPACE_SLOW_INTERVAL_MS: z.coerce.number().int().min(300_000).default(3_600_000),
  SPACE_PRUNE_INTERVAL_MS: z.coerce.number().int().min(600_000).default(21_600_000),
  SPACE_HISTORY_INTERVAL_MS: z.coerce.number().int().min(3_600_000).default(86_400_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  TRUST_PROXY: z.stringbool().default(false),
});

export type Config = z.infer<typeof schema>;
export type LogLevel = Config["LOG_LEVEL"];

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
