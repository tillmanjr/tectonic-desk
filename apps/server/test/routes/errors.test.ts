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
