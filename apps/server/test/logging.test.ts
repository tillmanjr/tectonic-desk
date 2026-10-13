import { describe, expect, it } from "vitest";
import { buildLoggerOptions } from "../src/logging.js";

describe("buildLoggerOptions", () => {
  it("uses plain JSON logging in production", () => {
    expect(buildLoggerOptions({ LOG_LEVEL: "warn", NODE_ENV: "production" })).toEqual({
      level: "warn",
    });
  });

  it("pretty prints outside production", () => {
    expect(buildLoggerOptions({ LOG_LEVEL: "debug", NODE_ENV: "development" })).toEqual({
      level: "debug",
      transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
    });
  });
});
