import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";

function fakeDb(execute: () => Promise<unknown>): Db {
  return { execute } as unknown as Db;
}

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp({ db: fakeDb(() => Promise.resolve({ rows: [] })) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "ok" });
    await app.close();
  });

  it("reports degraded with 503 when the database fails", async () => {
    const app = buildApp({ db: fakeDb(() => Promise.reject(new Error("boom"))) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", db: "error" });
    await app.close();
  });
});
