import type { FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";

export function buildLoggerOptions(
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">,
): FastifyServerOptions["logger"] {
  if (config.NODE_ENV === "production") return { level: config.LOG_LEVEL };
  return {
    level: config.LOG_LEVEL,
    transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
  };
}
