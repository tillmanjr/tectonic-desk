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
      INGEST_ENABLED: true,
      INGEST_DAY_INTERVAL_MS: 300_000,
      INGEST_WEEK_INTERVAL_MS: 3_600_000,
      USGS_BASE_URL: "https://earthquake.usgs.gov",
      USGS_USER_AGENT: "tectonic-desk/0.0 (+local)",
      VOLCANO_STATUS_INTERVAL_MS: 900_000,
      VOLCANO_REPORTS_INTERVAL_MS: 21_600_000,
      SPACE_ENABLED: true,
      SPACE_FAST_INTERVAL_MS: 300_000,
      SPACE_EVENTS_INTERVAL_MS: 300_000,
      SPACE_SLOW_INTERVAL_MS: 3_600_000,
      SPACE_PRUNE_INTERVAL_MS: 21_600_000,
      RATE_LIMIT_MAX: 120,
      RATE_LIMIT_WINDOW_MS: 60_000,
      TRUST_PROXY: false,
    });
  });

  it("parses rate-limit settings and the proxy flag", () => {
    const c = loadConfig({
      ...valid,
      RATE_LIMIT_MAX: "0",
      RATE_LIMIT_WINDOW_MS: "5000",
      TRUST_PROXY: "true",
    });
    expect(c.RATE_LIMIT_MAX).toBe(0);
    expect(c.RATE_LIMIT_WINDOW_MS).toBe(5000);
    expect(c.TRUST_PROXY).toBe(true);
    expect(() => loadConfig({ ...valid, RATE_LIMIT_WINDOW_MS: "10" })).toThrow(ConfigError);
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

  it("parses ingest settings", () => {
    const c = loadConfig({
      ...valid,
      INGEST_ENABLED: "false",
      INGEST_DAY_INTERVAL_MS: "60000",
      INGEST_WEEK_INTERVAL_MS: "300000",
      USGS_BASE_URL: "http://127.0.0.1:9999",
      USGS_USER_AGENT: "test-agent",
    });
    expect(c.INGEST_ENABLED).toBe(false);
    expect(c.INGEST_DAY_INTERVAL_MS).toBe(60000);
    expect(c.INGEST_WEEK_INTERVAL_MS).toBe(300000);
    expect(c.USGS_BASE_URL).toBe("http://127.0.0.1:9999");
    expect(c.USGS_USER_AGENT).toBe("test-agent");
    expect(() => loadConfig({ ...valid, INGEST_DAY_INTERVAL_MS: "1000" })).toThrow(
      /INGEST_DAY_INTERVAL_MS/,
    );
    const v = loadConfig({
      ...valid,
      VOLCANO_STATUS_INTERVAL_MS: "60000",
      VOLCANO_REPORTS_INTERVAL_MS: "600000",
    });
    expect(v.VOLCANO_STATUS_INTERVAL_MS).toBe(60000);
    expect(v.VOLCANO_REPORTS_INTERVAL_MS).toBe(600000);
    expect(() => loadConfig({ ...valid, VOLCANO_REPORTS_INTERVAL_MS: "1000" })).toThrow(
      /VOLCANO_REPORTS_INTERVAL_MS/,
    );
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

  it("parses space weather settings", () => {
    const c = loadConfig({
      ...valid,
      SPACE_ENABLED: "false",
      SPACE_FAST_INTERVAL_MS: "60000",
      SPACE_EVENTS_INTERVAL_MS: "120000",
      SPACE_SLOW_INTERVAL_MS: "300000",
      SPACE_PRUNE_INTERVAL_MS: "600000",
    });
    expect(c.SPACE_ENABLED).toBe(false);
    expect(c.SPACE_FAST_INTERVAL_MS).toBe(60000);
    expect(c.SPACE_EVENTS_INTERVAL_MS).toBe(120000);
    expect(c.SPACE_SLOW_INTERVAL_MS).toBe(300000);
    expect(c.SPACE_PRUNE_INTERVAL_MS).toBe(600000);
    expect(() => loadConfig({ ...valid, SPACE_FAST_INTERVAL_MS: "1000" })).toThrow(ConfigError);
  });
});
