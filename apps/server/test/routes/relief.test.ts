import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import type { ReliefLayout } from "../../src/geo/relief.js";

const db = {} as unknown as Db;
/** A 4×2 world of 90° cells: north row 0 10 20 30, south row 40 50 60 70. */
const tiny: ReliefLayout = { width: 4, height: 2, cellDeg: 90, scale: 0.5, tileSize: 1 };

describe("GET /api/relief", () => {
  const dir = mkdtempSync(join(tmpdir(), "relief-route-"));
  const file = join(dir, "grid.i16");
  writeFileSync(file, Buffer.from(new Int16Array([0, 10, 20, 30, 40, 50, 60, 70]).buffer));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("samples the grid along the line and caches for a day", async () => {
    const app = buildApp({ db, reliefFile: file, reliefLayout: tiny });
    const res = await app.inject({
      method: "GET",
      url: "/api/relief?section=-135,45,-45,45&n=3",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=86400");
    const body = res.json<{ stepKm: number; metres: number[] }>();
    expect(body.metres).toEqual([0, 5, 10]);
    expect(body.stepKm).toBeCloseTo(3335.85, 0);
    const dflt = await app.inject({ method: "GET", url: "/api/relief?section=-135,45,-45,45" });
    expect(dflt.json<{ metres: number[] }>().metres).toHaveLength(256);
    await app.close();
  });

  it("404s without a grid and 400s a bad query", async () => {
    const none = buildApp({ db, reliefFile: null });
    const res = await none.inject({ method: "GET", url: "/api/relief?section=0,0,1,1" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "relief grid not available" });
    await none.close();
    const app = buildApp({ db, reliefFile: file, reliefLayout: tiny });
    for (const url of [
      "/api/relief?section=0,0,1",
      "/api/relief?section=0,95,1,1",
      "/api/relief?section=a,b,c,d",
      "/api/relief?section=0,0,1,1&n=5000",
      "/api/relief",
      "/api/relief?section=0,0,1,1&extra=1",
    ]) {
      const bad = await app.inject({ method: "GET", url });
      expect(bad.statusCode, url).toBe(400);
      expect(bad.json<{ error: string }>().error).toBe("invalid request");
    }
    await app.close();
  });

  it("answers 404 when the default grid file is absent", async () => {
    const app = buildApp({ db, reliefFile: join(dir, "missing.i16") });
    const res = await app.inject({ method: "GET", url: "/api/relief?section=0,0,1,1" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
