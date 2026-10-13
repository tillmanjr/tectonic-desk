import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import { REGIONS } from "../../src/regions.js";

describe("GET /api/regions", () => {
  it("returns the presets with a short cache", async () => {
    const app = buildApp({ db: {} as unknown as Db });
    const res = await app.inject({ method: "GET", url: "/api/regions" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.json()).toEqual(REGIONS);
    await app.close();
  });
});
