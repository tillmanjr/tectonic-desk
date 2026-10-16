import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";

describe("error handling", () => {
  it("returns 400 with issues before touching the database", async () => {
    const app = buildApp({ db: {} as unknown as Db });
    const res = await app.inject({ method: "GET", url: "/api/events?limit=0&since=never" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "invalid request",
      issues: [{ path: "since" }, { path: "limit" }],
    });
    await app.close();
  });

  it("returns 404 json for unknown paths", async () => {
    const app = buildApp({ db: {} as unknown as Db });
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not found" });
    await app.close();
  });

  it("answers 429 in the error shape once a client exceeds the limit, per forwarded address when trusted", async () => {
    const app = buildApp({
      db: {} as unknown as Db,
      rateLimit: { max: 2, windowMs: 60_000 },
      trustProxy: true,
    });
    const hit = (ip: string) =>
      app.inject({ method: "GET", url: "/api/regions", headers: { "x-forwarded-for": ip } });
    expect((await hit("10.0.0.1")).statusCode).toBe(200);
    expect((await hit("10.0.0.1")).statusCode).toBe(200);
    const third = await hit("10.0.0.1");
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "too many requests, retry in 60 s" });
    expect(String(third.headers["retry-after"])).toBe("60");
    expect(String(third.headers["x-ratelimit-limit"])).toBe("2");
    expect((await hit("10.0.0.2")).statusCode).toBe(200);
    await app.close();
  });

  it("turns the limiter off at max 0 and defaults to 120 a minute", async () => {
    const open = buildApp({ db: {} as unknown as Db, rateLimit: { max: 0, windowMs: 1000 } });
    for (let i = 0; i < 5; i++) {
      const res = await open.inject({ method: "GET", url: "/api/regions" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    }
    await open.close();
    const app = buildApp({ db: {} as unknown as Db });
    const res = await app.inject({ method: "GET", url: "/api/regions" });
    expect(String(res.headers["x-ratelimit-limit"])).toBe("120");
    await app.close();
  });

  it("returns 500 json and logs when a repository rejects", async () => {
    const db = {
      query: { events: { findFirst: () => Promise.reject(new Error("db down")) } },
    } as unknown as Db;
    const lines: string[] = [];
    const app = buildApp({
      db,
      logger: {
        level: "error",
        stream: {
          write: (line: string) => {
            lines.push(line);
          },
        },
      },
    });
    const res = await app.inject({ method: "GET", url: "/api/events/us1" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal error" });
    expect(lines.join("")).toContain("db down");
    await app.close();
  });
});
