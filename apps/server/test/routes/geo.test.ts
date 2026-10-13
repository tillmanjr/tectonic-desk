import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";

const db = {} as unknown as Db;

describe("GET /api/geo/:name", () => {
  it("serves a file with etag and long cache", async () => {
    const app = buildApp({ db });
    const res = await app.inject({ method: "GET", url: "/api/geo/plates" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["cache-control"]).toBe("public, max-age=86400");
    expect(res.headers.etag).toMatch(/^"[0-9a-f]{40}"$/);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });

  it("answers 304 when If-None-Match matches", async () => {
    const app = buildApp({ db });
    const first = await app.inject({ method: "GET", url: "/api/geo/wc-land" });
    const etag = first.headers.etag;
    expect(typeof etag).toBe("string");
    const res = await app.inject({
      method: "GET",
      url: "/api/geo/wc-land",
      headers: { "if-none-match": String(etag) },
    });
    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");
    expect(res.headers.etag).toBe(etag);
    await app.close();
  });

  it("404s an unknown name with the common error shape", async () => {
    const app = buildApp({ db });
    const res = await app.inject({ method: "GET", url: "/api/geo/moon" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "unknown geo asset" });
    await app.close();
  });
});
