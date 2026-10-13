import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const valid = { DATABASE_URL: "postgres://u:p@localhost:5433/db" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig(valid);
    expect(c).toEqual({
      DATABASE_URL: valid.DATABASE_URL,
      PORT: 3000,
      HOST: "127.0.0.1",
      LOG_LEVEL: "info",
      NODE_ENV: "development",
    });
  });

  it("coerces PORT and accepts overrides", () => {
    const c = loadConfig({
      ...valid,
      PORT: "8080",
      HOST: "0.0.0.0",
      LOG_LEVEL: "debug",
      NODE_ENV: "production",
    });
    expect(c.PORT).toBe(8080);
    expect(c.HOST).toBe("0.0.0.0");
    expect(c.LOG_LEVEL).toBe("debug");
    expect(c.NODE_ENV).toBe("production");
  });

  it("throws ConfigError naming the bad variable", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...valid, PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...valid, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });

  it("reads process.env by default", () => {
    process.env.DATABASE_URL = valid.DATABASE_URL;
    expect(loadConfig().DATABASE_URL).toBe(valid.DATABASE_URL);
    delete process.env.DATABASE_URL;
  });
});
